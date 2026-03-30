import { createReminderSchema } from "@homecal/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { eventReminders, events } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

type Session = typeof auth.$Infer.Session;

export const remindersApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

remindersApp.use(requireAuth);

// Helper: fetch event and check visibility
async function getVisibleEvent(eventId: string, userId: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event) return null;
  if (event.private && event.ownerId !== userId) return null;
  return event;
}

// GET / — List reminders for an event
remindersApp.get("/", async (c) => {
  const eventId = c.req.param("eventId") as string;
  const userId = c.get("user").id;

  const event = await getVisibleEvent(eventId, userId);
  if (!event) return c.json({ error: "Not found" }, 404);

  const reminders = await db
    .select({
      id: eventReminders.id,
      eventId: eventReminders.eventId,
      minutesBefore: eventReminders.minutesBefore,
      channel: eventReminders.channel,
      createdAt: eventReminders.createdAt,
    })
    .from(eventReminders)
    .where(eq(eventReminders.eventId, eventId))
    .orderBy(eventReminders.minutesBefore);

  return c.json(reminders);
});

// POST / — Add a reminder
remindersApp.post("/", async (c) => {
  const eventId = c.req.param("eventId") as string;
  const userId = c.get("user").id;

  const event = await getVisibleEvent(eventId, userId);
  if (!event) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json();
  const parsed = createReminderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  // Check for duplicate (same eventId + minutesBefore + channel)
  const existing = await db.query.eventReminders.findFirst({
    where: (r, { and, eq: eqFn }) =>
      and(
        eqFn(r.eventId, eventId),
        eqFn(r.minutesBefore, parsed.data.minutesBefore),
        eqFn(r.channel, parsed.data.channel),
      ),
  });
  if (existing) {
    return c.json({ error: "Reminder already exists for this interval and channel" }, 409);
  }

  const [reminder] = await db
    .insert(eventReminders)
    .values({
      eventId,
      minutesBefore: parsed.data.minutesBefore,
      channel: parsed.data.channel,
    })
    .returning();

  return c.json(reminder, 201);
});

// DELETE /:reminderId — Remove a reminder
remindersApp.delete("/:reminderId", async (c) => {
  const eventId = c.req.param("eventId") as string;
  const reminderId = c.req.param("reminderId");
  const userId = c.get("user").id;

  const event = await getVisibleEvent(eventId, userId);
  if (!event) return c.json({ error: "Not found" }, 404);

  const reminder = await db.query.eventReminders.findFirst({
    where: (r, { and, eq: eqFn }) => and(eqFn(r.id, reminderId), eqFn(r.eventId, eventId)),
  });
  if (!reminder) return c.json({ error: "Not found" }, 404);

  await db.delete(eventReminders).where(eq(eventReminders.id, reminderId));

  return c.json({ success: true });
});
