import {
  createEventSchema,
  eventQuerySchema,
  parseEventInputSchema,
  updateEventSchema,
} from "@homecal/shared";
import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { eventAssignees, eventLogs, events, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { buildParsePrompt, callLlm, parseLlmResponse } from "../services/llm.js";

type Session = typeof auth.$Infer.Session;

export const eventsApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

eventsApp.use(requireAuth);

// Shape raw assignee join results into [{ id, name, color }]
function formatAssignees(
  assignees: { user: { id: string; name: string; color: string } }[],
): { id: string; name: string; color: string }[] {
  return assignees.map((a) => ({ id: a.user.id, name: a.user.name, color: a.user.color }));
}

// POST /parse — Parse natural language into event fields
eventsApp.post("/parse", async (c) => {
  const body = await c.req.json();
  const parsed = parseEventInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const gatewayUrl = process.env.LLM_GATEWAY_URL || "http://localhost:51277";
  const model = process.env.LLM_MODEL || "claude-haiku-4-5";
  const fallbackModel = process.env.LLM_FALLBACK_MODEL || "gemma3:27b";
  const today = new Date().toISOString().split("T")[0];

  // Fetch members for assignee resolution
  const memberRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .orderBy(users.name);
  const memberNames = memberRows.map((m) => m.name);
  const memberNameToId = new Map(memberRows.map((m) => [m.name, m.id]));

  try {
    const systemPrompt = buildParsePrompt(today, memberNames);
    let raw: string;
    try {
      raw = await callLlm({ gatewayUrl, model }, systemPrompt, parsed.data.text);
    } catch {
      raw = await callLlm({ gatewayUrl, model: fallbackModel }, systemPrompt, parsed.data.text);
    }
    const result = parseLlmResponse(raw, memberNameToId);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM parsing failed";
    return c.json({ error: message }, 502);
  }
});

// POST / — Create event
eventsApp.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const userId = c.get("user").id;
  const data = parsed.data;

  const [event] = await db
    .insert(events)
    .values({
      title: data.title,
      start: new Date(data.start),
      end: new Date(data.end),
      private: data.private,
      ownerId: userId,
    })
    .returning();

  // Insert assignees: use provided list, or default to owner
  const assigneeUserIds =
    data.assigneeIds && data.assigneeIds.length > 0 ? data.assigneeIds : [userId];
  await db
    .insert(eventAssignees)
    .values(assigneeUserIds.map((uid) => ({ eventId: event.id, userId: uid })));

  // Fetch assignees with user info
  const assigneeRows = await db.query.eventAssignees.findMany({
    where: eq(eventAssignees.eventId, event.id),
    with: { user: true },
  });

  // Log creation for shared events only
  if (!event.private) {
    await db.insert(eventLogs).values({
      eventId: event.id,
      userId,
      action: "created",
      changes: null,
    });
  }

  return c.json({ ...event, assignees: formatAssignees(assigneeRows) }, 201);
});

// GET / — List events
eventsApp.get("/", async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = eventQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const userId = c.get("user").id;
  const { from, to } = parsed.data;

  const conditions = [
    // Visibility: shared events OR own private events
    or(eq(events.private, false), and(eq(events.private, true), eq(events.ownerId, userId))),
  ];

  if (from) {
    conditions.push(gte(events.start, new Date(from)));
  }
  if (to) {
    conditions.push(lte(events.start, new Date(to)));
  }

  const result = await db.query.events.findMany({
    where: and(...conditions),
    orderBy: events.start,
    with: { assignees: { with: { user: true } }, reminders: true },
  });

  const shaped = result.map((e) => {
    const { assignees: rawAssignees, reminders: rawReminders, ...rest } = e;
    return {
      ...rest,
      assignees: formatAssignees(rawAssignees),
      reminders: rawReminders.map((r) => ({ id: r.id, minutesBefore: r.minutesBefore })),
    };
  });

  return c.json(shaped);
});

// GET /:id — Get single event
eventsApp.get("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").id;

  const result = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: { owner: true, assignees: { with: { user: true } }, reminders: true },
  });

  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  // Private events return 404 to non-owners (don't leak existence)
  if (result.private && result.ownerId !== userId) {
    return c.json({ error: "Not found" }, 404);
  }

  const { assignees: rawAssignees, reminders: rawReminders, ...rest } = result;
  return c.json({
    ...rest,
    assignees: formatAssignees(rawAssignees),
    reminders: rawReminders.map((r) => ({ id: r.id, minutesBefore: r.minutesBefore })),
  });
});

// GET /:id/logs — Get event change logs
eventsApp.get("/:id/logs", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").id;

  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!event) {
    return c.json({ error: "Not found" }, 404);
  }

  if (event.private && event.ownerId !== userId) {
    return c.json({ error: "Not found" }, 404);
  }

  const logs = await db
    .select({
      id: eventLogs.id,
      action: eventLogs.action,
      changes: eventLogs.changes,
      timestamp: eventLogs.timestamp,
      user: {
        id: users.id,
        name: users.name,
        color: users.color,
      },
    })
    .from(eventLogs)
    .innerJoin(users, eq(eventLogs.userId, users.id))
    .where(eq(eventLogs.eventId, id))
    .orderBy(desc(eventLogs.timestamp));

  return c.json(logs);
});

// PATCH /:id — Update event
eventsApp.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").id;

  const body = await c.req.json();
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  // Fetch existing event
  const existing = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!existing) {
    return c.json({ error: "Not found" }, 404);
  }

  // Private events: only owner can update
  if (existing.private && existing.ownerId !== userId) {
    return c.json({ error: "Not found" }, 404);
  }

  const data = parsed.data;

  // Build update values and field-level diff
  const updateValues: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (data.title !== undefined && data.title !== existing.title) {
    updateValues.title = data.title;
    changes.title = { from: existing.title, to: data.title };
  }
  if (data.start !== undefined) {
    const newStart = new Date(data.start);
    if (newStart.getTime() !== existing.start.getTime()) {
      updateValues.start = newStart;
      changes.start = { from: existing.start.toISOString(), to: data.start };
    }
  }
  if (data.end !== undefined) {
    const newEnd = new Date(data.end);
    if (newEnd.getTime() !== existing.end.getTime()) {
      updateValues.end = newEnd;
      changes.end = { from: existing.end.toISOString(), to: data.end };
    }
  }
  if (data.private !== undefined && data.private !== existing.private) {
    updateValues.private = data.private;
    changes.private = { from: existing.private, to: data.private };
  }

  // Handle assignee updates
  let assigneesChanged = false;
  if (data.assigneeIds !== undefined) {
    // Empty array → default to owner (events must have at least one assignee)
    const newAssigneeIds = data.assigneeIds.length > 0 ? data.assigneeIds : [userId];

    // Get current assignee IDs
    const currentAssignees = await db.query.eventAssignees.findMany({
      where: eq(eventAssignees.eventId, id),
    });
    const currentIds = currentAssignees.map((a) => a.userId).sort();
    const newIds = [...newAssigneeIds].sort();

    if (JSON.stringify(currentIds) !== JSON.stringify(newIds)) {
      assigneesChanged = true;
      changes.assigneeIds = { from: currentIds, to: newIds };

      // Replace: delete all, insert new
      await db.delete(eventAssignees).where(eq(eventAssignees.eventId, id));
      await db
        .insert(eventAssignees)
        .values(newAssigneeIds.map((uid) => ({ eventId: id, userId: uid })));
    }
  }

  // No actual changes — return existing event with assignees
  if (Object.keys(updateValues).length === 0 && !assigneesChanged) {
    const assigneeRows = await db.query.eventAssignees.findMany({
      where: eq(eventAssignees.eventId, id),
      with: { user: true },
    });
    return c.json({ ...existing, assignees: formatAssignees(assigneeRows) });
  }

  let updated = existing;
  if (Object.keys(updateValues).length > 0) {
    updateValues.updatedAt = new Date();
    [updated] = await db.update(events).set(updateValues).where(eq(events.id, id)).returning();
  }

  // Log changes for shared events (or events transitioning to/from shared)
  const wasShared = !existing.private;
  const isNowShared = !updated.private;
  if (wasShared || isNowShared) {
    await db.insert(eventLogs).values({
      eventId: updated.id,
      userId,
      action: "updated",
      changes,
    });
  }

  // Fetch assignees for response
  const assigneeRows = await db.query.eventAssignees.findMany({
    where: eq(eventAssignees.eventId, id),
    with: { user: true },
  });

  return c.json({ ...updated, assignees: formatAssignees(assigneeRows) });
});

// DELETE /:id — Delete event
eventsApp.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").id;

  const existing = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!existing) {
    return c.json({ error: "Not found" }, 404);
  }

  // Private events: only owner can delete
  if (existing.private && existing.ownerId !== userId) {
    return c.json({ error: "Not found" }, 404);
  }

  // No logging — event_logs.eventId has onDelete: cascade, logs would be immediately deleted
  await db.delete(events).where(eq(events.id, id));

  return c.json({ success: true });
});
