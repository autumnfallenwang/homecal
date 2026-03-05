import { createEventSchema, eventQuerySchema, updateEventSchema } from "@homecal/shared";
import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { eventLogs, events, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

type Session = typeof auth.$Infer.Session;

export const eventsApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

eventsApp.use(requireAuth);

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

  // Log creation for shared events only
  if (!event.private) {
    await db.insert(eventLogs).values({
      eventId: event.id,
      userId,
      action: "created",
      changes: null,
    });
  }

  return c.json(event, 201);
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

  const result = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(events.start);

  return c.json(result);
});

// GET /:id — Get single event
eventsApp.get("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").id;

  const result = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: { owner: true },
  });

  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  // Private events return 404 to non-owners (don't leak existence)
  if (result.private && result.ownerId !== userId) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(result);
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

  // No actual changes — return existing event unchanged
  if (Object.keys(updateValues).length === 0) {
    return c.json(existing);
  }

  updateValues.updatedAt = new Date();

  const [updated] = await db.update(events).set(updateValues).where(eq(events.id, id)).returning();

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

  return c.json(updated);
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
