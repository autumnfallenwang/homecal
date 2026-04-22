import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { deviceTokens, eventAssignees, eventReminders, events, users } from "../db/schema.js";
import { type ApnsConfig, getApnsConfig, type PushPayload, sendPush } from "./apns.js";
import { type EmailConfig, getEmailConfig, sendReminderEmail } from "./email.js";

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

export interface DispatchFns {
  pushFn?: (
    config: ApnsConfig,
    token: string,
    payload: PushPayload,
  ) => Promise<{ success: boolean; reason?: string }>;
  emailFn?: (
    config: EmailConfig,
    to: string,
    subject: string,
    body: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

export async function checkDueReminders(fns?: DispatchFns): Promise<number> {
  // Find reminders that are due and haven't been sent
  const dueReminders = await db
    .select({
      reminderId: eventReminders.id,
      eventId: eventReminders.eventId,
      minutesBefore: eventReminders.minutesBefore,
      channel: eventReminders.channel,
      eventTitle: events.title,
      eventStart: events.start,
    })
    .from(eventReminders)
    .innerJoin(events, eq(eventReminders.eventId, events.id))
    .where(
      and(
        isNull(eventReminders.sentAt),
        sql`${events.start} - (${eventReminders.minutesBefore} * interval '1 minute') <= now()`,
      ),
    );

  if (dueReminders.length === 0) return 0;

  const apnsConfig = getApnsConfig();
  const emailConfig = getEmailConfig();
  const push = fns?.pushFn ?? sendPush;
  const email = fns?.emailFn ?? sendReminderEmail;
  let sentCount = 0;

  for (const reminder of dueReminders) {
    // Get all assignees for this event
    const assignees = await db
      .select({ userId: eventAssignees.userId })
      .from(eventAssignees)
      .where(eq(eventAssignees.eventId, reminder.eventId));

    if (assignees.length === 0) {
      await db
        .update(eventReminders)
        .set({ sentAt: new Date() })
        .where(eq(eventReminders.id, reminder.reminderId));
      continue;
    }

    const assigneeIds = assignees.map((a) => a.userId);
    const bodyText = formatReminderBody(reminder.minutesBefore);

    let deliveryOk = true;

    if (reminder.channel === "email") {
      // Get assignees' email addresses
      const assigneeUsers = await db
        .select({ email: users.email })
        .from(users)
        .where(
          sql`${users.id} IN (${sql.join(
            assigneeIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );

      for (const user of assigneeUsers) {
        if (!emailConfig && !fns?.emailFn) {
          console.warn("[reminder-scheduler] Email not configured, skipping");
          deliveryOk = false;
          continue;
        }
        const config = emailConfig as EmailConfig;
        const result = await email(
          config,
          user.email,
          `Reminder: ${reminder.eventTitle}`,
          `${reminder.eventTitle} — ${bodyText}`,
        );
        if (!result.success) {
          console.error(
            `[reminder-scheduler] email send failed: reminder=${reminder.reminderId} to=${user.email} err=${result.error}`,
          );
          deliveryOk = false;
        }
      }
    } else if (reminder.channel === "push") {
      // Get device tokens for all assignees
      const tokens = await db
        .select({ id: deviceTokens.id, token: deviceTokens.token })
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
        body: bodyText,
      };

      for (const device of tokens) {
        if (!apnsConfig && !fns?.pushFn) {
          console.warn("[reminder-scheduler] APNs not configured, skipping push");
          continue;
        }
        const config = apnsConfig as ApnsConfig;
        const result = await push(config, device.token, payload);

        if (
          !result.success &&
          (result.reason === "BadDeviceToken" || result.reason === "Unregistered")
        ) {
          await db.delete(deviceTokens).where(eq(deviceTokens.id, device.id));
        }
      }
    }

    // Only mark reminder as sent if delivery succeeded (otherwise retry next tick)
    if (deliveryOk) {
      await db
        .update(eventReminders)
        .set({ sentAt: new Date() })
        .where(eq(eventReminders.id, reminder.reminderId));
      sentCount++;
    }
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
