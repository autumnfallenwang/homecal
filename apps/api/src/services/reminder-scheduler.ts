import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { deviceTokens, eventAssignees, eventReminders, events } from "../db/schema.js";
import { type ApnsConfig, getApnsConfig, type PushPayload, sendPush } from "./apns.js";

export function formatReminderBody(minutesBefore: number): string {
  if (minutesBefore < 60) {
    return minutesBefore === 1 ? "in 1 minute" : `in ${minutesBefore} minutes`;
  }
  if (minutesBefore === 60) return "in 1 hour";
  if (minutesBefore < 1440) {
    const hours = Math.round(minutesBefore / 60);
    return hours === 1 ? "in 1 hour" : `in ${hours} hours`;
  }
  if (minutesBefore === 1440) return "tomorrow";
  const days = Math.round(minutesBefore / 1440);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export async function checkDueReminders(
  pushFn?: (
    config: ApnsConfig,
    token: string,
    payload: PushPayload,
  ) => Promise<{ success: boolean; reason?: string }>,
): Promise<number> {
  // Find reminders that are due and haven't been sent
  const dueReminders = await db
    .select({
      reminderId: eventReminders.id,
      eventId: eventReminders.eventId,
      minutesBefore: eventReminders.minutesBefore,
      eventTitle: events.title,
      eventStart: events.start,
    })
    .from(eventReminders)
    .innerJoin(events, eq(eventReminders.eventId, events.id))
    .where(
      and(
        isNull(eventReminders.sentAt),
        // event.start - minutesBefore (in ms) <= now
        sql`${events.start} - (${eventReminders.minutesBefore} * interval '1 minute') <= now()`,
      ),
    );

  if (dueReminders.length === 0) return 0;

  const apnsConfig = getApnsConfig();
  const send = pushFn ?? sendPush;
  let sentCount = 0;

  for (const reminder of dueReminders) {
    // Get all assignees for this event
    const assignees = await db
      .select({ userId: eventAssignees.userId })
      .from(eventAssignees)
      .where(eq(eventAssignees.eventId, reminder.eventId));

    if (assignees.length === 0) {
      // No assignees — still mark as sent to avoid re-processing
      await db
        .update(eventReminders)
        .set({ sentAt: new Date() })
        .where(eq(eventReminders.id, reminder.reminderId));
      continue;
    }

    // Get device tokens for all assignees
    const assigneeIds = assignees.map((a) => a.userId);
    const tokens = await db
      .select({ id: deviceTokens.id, userId: deviceTokens.userId, token: deviceTokens.token })
      .from(deviceTokens)
      .where(
        and(
          sql`${deviceTokens.userId} IN (${sql.join(
            assigneeIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          eq(deviceTokens.platform, "ios"),
        ),
      );

    const payload: PushPayload = {
      title: reminder.eventTitle,
      body: formatReminderBody(reminder.minutesBefore),
    };

    // Send to each device
    for (const device of tokens) {
      if (!apnsConfig && !pushFn) {
        console.warn("[reminder-scheduler] APNs not configured, skipping push");
        continue;
      }

      const config = apnsConfig as ApnsConfig;
      const result = await send(config, device.token, payload);

      if (
        !result.success &&
        (result.reason === "BadDeviceToken" || result.reason === "Unregistered")
      ) {
        // Remove stale device token
        await db.delete(deviceTokens).where(eq(deviceTokens.id, device.id));
      }
    }

    // Mark reminder as sent
    await db
      .update(eventReminders)
      .set({ sentAt: new Date() })
      .where(eq(eventReminders.id, reminder.reminderId));

    sentCount++;
  }

  return sentCount;
}

export function startReminderScheduler(intervalMs = 60000): NodeJS.Timeout {
  console.info(`[reminder-scheduler] started (interval: ${intervalMs}ms)`);

  // Run immediately on start
  checkDueReminders().catch((err) => console.error("[reminder-scheduler] error:", err));

  return setInterval(() => {
    checkDueReminders().catch((err) => console.error("[reminder-scheduler] error:", err));
  }, intervalMs);
}
