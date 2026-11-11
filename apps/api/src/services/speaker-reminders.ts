/**
 * Event reminders on speakers (Phase 26). Two ways a reminder reaches a speaker:
 *
 *   1. Per event — a reminder row with channel "speaker". It plays on the
 *      speakers picked for it, else on the speakers serving the event's
 *      assignees. Someone chose that time, so it rings through quiet hours.
 *   2. Per member — every reminder row (any channel) also plays on the
 *      speakers serving assignees whose `reminderDelivery` includes "speaker".
 *      These are automatic, so they respect quiet hours.
 *
 * Both are keyed `reminder:<eventId>:<minutesBefore>`, so an event with an
 * email row and a push row at 15 min plays once. Private events are never read
 * aloud. Items due in the next 24 h ride in the desired state, so they still
 * fire through a short cluster outage.
 */

import type { DesiredScheduleItem } from "@homecal/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  eventAssignees,
  eventReminderDevices,
  eventReminders,
  events,
  householdDeviceMembers,
  users,
} from "../db/schema.js";
import { type HouseholdDeviceRow, speakerSettingsOf } from "./household-devices.js";
import { isQuietAt, quietWindowsFor } from "./local-time.js";
import { formatReminderBody } from "./reminder-scheduler.js";
import { registerRangHandler, registerScheduleProvider } from "./speaker-sync.js";

const HORIZON_MS = 24 * 3600_000;
const SEND_GRACE_MS = 2 * 60_000;

export function reminderText(title: string, minutesBefore: number): string {
  if (minutesBefore === 0) return `${title} is starting now.`;
  return `${title} starts ${formatReminderBody(minutesBefore)}.`;
}

export function reminderItemId(eventId: string, minutesBefore: number): string {
  return `reminder:${eventId}:${minutesBefore}`;
}

/** Reminder rows due in [from, to], for non-private events. */
function dueRows(from: Date, to: Date) {
  const due = sql`${events.start} - (${eventReminders.minutesBefore} * interval '1 minute')`;
  return db
    .select({
      reminderId: eventReminders.id,
      eventId: events.id,
      title: events.title,
      start: events.start,
      minutesBefore: eventReminders.minutesBefore,
      channel: eventReminders.channel,
    })
    .from(eventReminders)
    .innerJoin(events, eq(eventReminders.eventId, events.id))
    .where(
      and(
        eq(events.private, false),
        // ISO strings, not Dates: postgres-js can't bind a Date inside raw sql.
        sql`${due} >= ${from.toISOString()}::timestamptz`,
        sql`${due} <= ${to.toISOString()}::timestamptz`,
      ),
    );
}

export async function reminderScheduleFor(
  device: HouseholdDeviceRow,
  ctx: { now: Date; tz: string },
): Promise<DesiredScheduleItem[]> {
  const rows = await dueRows(
    new Date(ctx.now.getTime() - SEND_GRACE_MS),
    new Date(ctx.now.getTime() + HORIZON_MS),
  );
  if (rows.length === 0) return [];

  const eventIds = [...new Set(rows.map((r) => r.eventId))];
  const assigneeRows = await db
    .select({
      eventId: eventAssignees.eventId,
      userId: eventAssignees.userId,
      delivery: users.reminderDelivery,
    })
    .from(eventAssignees)
    .innerJoin(users, eq(eventAssignees.userId, users.id))
    .where(inArray(eventAssignees.eventId, eventIds));
  const served = new Set(
    (
      await db
        .select({ userId: householdDeviceMembers.userId })
        .from(householdDeviceMembers)
        .where(eq(householdDeviceMembers.deviceId, device.id))
    ).map((r) => r.userId),
  );
  const speakerRowIds = rows.filter((r) => r.channel === "speaker").map((r) => r.reminderId);
  const picks = speakerRowIds.length
    ? await db
        .select()
        .from(eventReminderDevices)
        .where(inArray(eventReminderDevices.reminderId, speakerRowIds))
    : [];

  const quiet = quietWindowsFor(speakerSettingsOf(device).quietHours, ctx.tz, ctx.now, 2);
  const items = new Map<string, DesiredScheduleItem>();

  for (const r of rows) {
    const assignees = assigneeRows.filter((a) => a.eventId === r.eventId);
    const at = new Date(r.start.getTime() - r.minutesBefore * 60_000);
    let plays = false;

    if (r.channel === "speaker") {
      const picked = picks.filter((p) => p.reminderId === r.reminderId).map((p) => p.deviceId);
      plays =
        picked.length > 0
          ? picked.includes(device.id)
          : assignees.some((a) => served.has(a.userId));
    }
    if (!plays) {
      const automatic = assignees.some(
        (a) => served.has(a.userId) && a.delivery.includes("speaker"),
      );
      plays = automatic && !isQuietAt(quiet, at);
    }
    if (!plays) continue;

    const id = reminderItemId(r.eventId, r.minutesBefore);
    items.set(id, {
      id,
      kind: "reminder",
      at: at.toISOString(),
      sound: "chime",
      text: reminderText(r.title, r.minutesBefore),
    });
  }
  return [...items.values()];
}

const REMINDER_ID = /^reminder:([0-9a-f-]{36}):(\d{1,5})$/;

/** A speaker played a reminder: stamp the speaker-channel row(s) as sent. */
async function storeReminderRang(_device: HouseholdDeviceRow, r: { id: string; ok: boolean }) {
  const m = REMINDER_ID.exec(r.id);
  if (!m || !r.ok) return;
  await db
    .update(eventReminders)
    .set({ sentAt: new Date() })
    .where(
      and(
        eq(eventReminders.eventId, m[1]),
        eq(eventReminders.minutesBefore, Number(m[2])),
        eq(eventReminders.channel, "speaker"),
        isNull(eventReminders.sentAt),
      ),
    );
}

registerScheduleProvider(reminderScheduleFor);
registerRangHandler("reminder", storeReminderRang);
