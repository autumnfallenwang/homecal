import {
  createEventSchema,
  eventQuerySchema,
  importIcsSchema,
  parseEventInputSchema,
  parseImageInputSchema,
  todayQuerySchema,
  updateEventSchema,
} from "@homecal/shared";
import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { eventAssignees, eventLogs, events, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { generateIcs } from "../services/ics-generator.js";
import { parseIcsEvents } from "../services/ics-parser.js";
import {
  buildImageParsePrompt,
  buildParsePrompt,
  callLlm,
  callLlmWithImage,
  parseLlmResponse,
} from "../services/llm.js";
import { getTodayEvents, type TodayEvent } from "../services/today.js";

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

// POST /parse-image — Parse image into event fields
eventsApp.post("/parse-image", async (c) => {
  const body = await c.req.json();
  const parsed = parseImageInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const gatewayUrl = process.env.LLM_GATEWAY_URL || "http://localhost:51277";
  const model = process.env.LLM_MODEL || "claude-haiku-4-5";
  const fallbackModel = process.env.LLM_FALLBACK_MODEL || "gemma3:27b";
  const today = new Date().toISOString().split("T")[0];

  const memberRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .orderBy(users.name);
  const memberNames = memberRows.map((m) => m.name);
  const memberNameToId = new Map(memberRows.map((m) => [m.name, m.id]));

  try {
    const systemPrompt = buildImageParsePrompt(today, memberNames);
    let raw: string;
    try {
      raw = await callLlmWithImage(
        { gatewayUrl, model },
        systemPrompt,
        parsed.data.image,
        parsed.data.mimeType,
      );
    } catch {
      raw = await callLlmWithImage(
        { gatewayUrl, model: fallbackModel },
        systemPrompt,
        parsed.data.image,
        parsed.data.mimeType,
      );
    }
    const result = parseLlmResponse(raw, memberNameToId);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image parsing failed";
    return c.json({ error: message }, 502);
  }
});

// POST /import — Import events from .ics file
eventsApp.post("/import", async (c) => {
  const body = await c.req.json();
  const parsed = importIcsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const userId = c.get("user").id;
  const { events: parsedEvents, skipped } = parseIcsEvents(parsed.data.icsData);

  if (parsedEvents.length === 0) {
    return c.json({ imported: 0, skipped, events: [] });
  }

  // Batch insert events
  const insertedEvents = await db
    .insert(events)
    .values(
      parsedEvents.map((e) => ({
        title: e.title,
        location: e.location || null,
        description: e.description || null,
        start: new Date(e.start),
        end: new Date(e.end),
        private: e.isPrivate,
        ownerId: userId,
      })),
    )
    .returning();

  // Batch insert assignees (owner = default assignee for each event)
  if (insertedEvents.length > 0) {
    await db.insert(eventAssignees).values(insertedEvents.map((e) => ({ eventId: e.id, userId })));

    // Log creation for shared events
    const sharedEvents = insertedEvents.filter((e) => !e.private);
    if (sharedEvents.length > 0) {
      await db.insert(eventLogs).values(
        sharedEvents.map((e) => ({
          eventId: e.id,
          userId,
          action: "created",
          changes: { source: "ics-import" },
        })),
      );
    }
  }

  return c.json({
    imported: insertedEvents.length,
    skipped,
    events: insertedEvents,
  });
});

// GET /export.ics — Export events as iCalendar file
eventsApp.get("/export.ics", async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = eventQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const userId = c.get("user").id;
  const { from, to } = parsed.data;

  const conditions = [
    or(eq(events.private, false), and(eq(events.private, true), eq(events.ownerId, userId))),
  ];
  if (from) conditions.push(gte(events.start, new Date(from)));
  if (to) conditions.push(lte(events.start, new Date(to)));

  const result = await db.query.events.findMany({
    where: and(...conditions),
    orderBy: events.start,
  });

  const icsContent = generateIcs(result);

  return new Response(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="homecal-export.ics"',
    },
  });
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
      location: data.location ?? null,
      description: data.description ?? null,
      start: new Date(data.start),
      end: new Date(data.end),
      private: data.private,
      seriesId: data.seriesId ?? null,
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
      reminders: rawReminders.map((r) => ({
        id: r.id,
        minutesBefore: r.minutesBefore,
        channel: r.channel,
      })),
    };
  });

  return c.json(shaped);
});

// GET /today — Timezone-aware snapshot for the Today view
eventsApp.get("/today", async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = todayQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const { tz, userIds } = parsed.data;
  const userIdFilter = userIds
    ? new Set(
        userIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  const requesterId = c.get("user").id;

  // Shared with the daily digest — see getTodayEvents in services/today.ts.
  // Throws on an invalid IANA zone → 400.
  let result: Awaited<ReturnType<typeof getTodayEvents>>;
  try {
    result = await getTodayEvents({ tz, requesterId, userIds: userIdFilter });
  } catch {
    return c.json({ error: "Invalid timezone" }, 400);
  }
  const { windows, todayEvents, tomorrowEvents } = result;
  const { tomorrowStart, tomorrowEnd } = windows;

  const hasMultiDayStart = tomorrowEvents.some((e) => {
    const s = new Date(e.start).getTime();
    const en = new Date(e.end).getTime();
    return s < tomorrowStart.getTime() || en > tomorrowEnd.getTime();
  });

  const shape = (e: TodayEvent) => {
    const { assignees: rawAssignees, reminders: rawReminders, ...rest } = e;
    return {
      ...rest,
      assignees: formatAssignees(rawAssignees),
      reminders: rawReminders.map((r) => ({
        id: r.id,
        minutesBefore: r.minutesBefore,
        channel: r.channel,
      })),
    };
  };

  return c.json({
    serverNow: new Date().toISOString(),
    today: todayEvents.map(shape),
    tomorrow: {
      count: tomorrowEvents.length,
      firstTitle: tomorrowEvents[0]?.title ?? null,
      hasMultiDayStart,
    },
  });
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
    reminders: rawReminders.map((r) => ({
      id: r.id,
      minutesBefore: r.minutesBefore,
      channel: r.channel,
    })),
  });
});

// GET /:id/export.ics — Export single event as iCalendar file
eventsApp.get("/:id/export.ics", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").id;

  const result = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!result || (result.private && result.ownerId !== userId)) {
    return c.json({ error: "Not found" }, 404);
  }

  const icsContent = generateIcs([result]);

  return new Response(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.title.replace(/[^a-zA-Z0-9 ]/g, "")}.ics"`,
    },
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
  if (data.location !== undefined && data.location !== (existing.location ?? undefined)) {
    updateValues.location = data.location ?? null;
    changes.location = { from: existing.location, to: data.location ?? null };
  }
  if (data.description !== undefined && data.description !== (existing.description ?? undefined)) {
    updateValues.description = data.description ?? null;
    changes.description = { from: existing.description, to: data.description ?? null };
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

// PATCH /series/:seriesId — Bulk update all events in a series
eventsApp.patch("/series/:seriesId", async (c) => {
  const seriesId = c.req.param("seriesId");
  const userId = c.get("user").id;

  const body = await c.req.json();
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  // Check series exists and user can access it
  const seriesEvents = await db.query.events.findMany({
    where: eq(events.seriesId, seriesId),
  });

  if (seriesEvents.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  // Check access — if any event is private, only owner can update
  const hasPrivate = seriesEvents.some((e) => e.private && e.ownerId !== userId);
  if (hasPrivate) {
    return c.json({ error: "Not found" }, 404);
  }

  const data = parsed.data;
  const updateValues: Record<string, unknown> = {};

  if (data.title !== undefined) updateValues.title = data.title;
  if (data.location !== undefined) updateValues.location = data.location ?? null;
  if (data.description !== undefined) updateValues.description = data.description ?? null;
  if (data.private !== undefined) updateValues.private = data.private;

  if (Object.keys(updateValues).length === 0) {
    return c.json({ updated: 0 });
  }

  updateValues.updatedAt = new Date();

  await db.update(events).set(updateValues).where(eq(events.seriesId, seriesId));

  return c.json({ updated: seriesEvents.length });
});

// DELETE /series/:seriesId — Bulk delete all events in a series
eventsApp.delete("/series/:seriesId", async (c) => {
  const seriesId = c.req.param("seriesId");
  const userId = c.get("user").id;

  const seriesEvents = await db.query.events.findMany({
    where: eq(events.seriesId, seriesId),
  });

  if (seriesEvents.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  // Check access
  const hasPrivate = seriesEvents.some((e) => e.private && e.ownerId !== userId);
  if (hasPrivate) {
    return c.json({ error: "Not found" }, 404);
  }

  await db.delete(events).where(eq(events.seriesId, seriesId));

  return c.json({ success: true, deleted: seriesEvents.length });
});
