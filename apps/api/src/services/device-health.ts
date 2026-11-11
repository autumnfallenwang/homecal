/**
 * Device liveness (Phase 23). Every scheduler tick re-derives each device's
 * status from lastSeenAt — not only on a change — so a device that was already
 * offline when the API restarted is still caught (the Home Assistant lesson).
 * One email per outage, one on recovery; `offlineAlertedAt` de-duplicates.
 */

import { deviceStatusFor } from "@homecal/shared";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { householdDevices, users } from "../db/schema.js";
import { log } from "../lib/logger.js";
import { getOrCreateDigestSettings } from "./digest-settings.js";
import { type EmailConfig, getEmailConfig, sendReminderEmail } from "./email.js";

export type AlertEmailFn = (
  config: EmailConfig,
  to: string,
  subject: string,
  body: string,
) => Promise<{ success: boolean; error?: string }>;

export interface DeviceAlertFns {
  emailFn?: AlertEmailFn;
  now?: () => Date;
}

/** Members who receive device alerts — opted in, never service accounts. */
export function getDeviceAlertRecipients(): Promise<{ id: string; email: string }[]> {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.receivesDeviceAlerts, true), eq(users.isService, false)));
}

export async function setDeviceAlertRecipients(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  const all = await db.select({ id: users.id }).from(users).where(eq(users.isService, false));
  const optIn = all.filter((u) => idSet.has(u.id)).map((u) => u.id);
  const optOut = all.filter((u) => !idSet.has(u.id)).map((u) => u.id);
  if (optIn.length > 0) {
    await db.update(users).set({ receivesDeviceAlerts: true }).where(inArray(users.id, optIn));
  }
  if (optOut.length > 0) {
    await db.update(users).set({ receivesDeviceAlerts: false }).where(inArray(users.id, optOut));
  }
}

/**
 * Email every alert recipient. Returns how many were sent. A missing email
 * config is logged and counts as zero sent — callers still record that the
 * alert was handled so it doesn't repeat every minute.
 */
export async function sendDeviceAlert(
  subject: string,
  body: string,
  fns?: DeviceAlertFns,
): Promise<number> {
  const recipients = await getDeviceAlertRecipients();
  const config = getEmailConfig();
  const send = fns?.emailFn ?? sendReminderEmail;
  if (!config && !fns?.emailFn) {
    log.warn(
      { event: "device.alert.email_skipped", reason: "email_not_configured", subject },
      "email not configured, skipping device alert",
    );
    return 0;
  }
  let sent = 0;
  for (const r of recipients) {
    const result = await send(config as EmailConfig, r.email, subject, body);
    if (result.success) sent++;
    else log.error({ event: "device.alert.email_fail", err: result.error }, "device alert failed");
  }
  log.info({ event: "device.alert", subject, sent_count: sent }, "device alert dispatched");
  return sent;
}

/** "14:05" in the household timezone, for alert copy. */
export function formatLocalTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

/**
 * One health tick: alert on newly offline devices, announce recoveries.
 * Returns the number of alerts dispatched (outage + recovery).
 */
export async function checkDeviceHealth(fns?: DeviceAlertFns): Promise<number> {
  const now = fns?.now?.() ?? new Date();
  const devices = await db.select().from(householdDevices);
  if (devices.length === 0) return 0;
  const { timezone } = await getOrCreateDigestSettings();
  let alerts = 0;

  for (const d of devices) {
    const status = deviceStatusFor(d.lastSeenAt, d.offlineAfterMinutes, now);

    if (status === "offline" && !d.offlineAlertedAt) {
      if (d.alertsEnabled && d.lastSeenAt) {
        const minutes = Math.round((now.getTime() - d.lastSeenAt.getTime()) / 60_000);
        await sendDeviceAlert(
          `HomeCal: ${d.name} is offline`,
          `${d.name} hasn't checked in since ${formatLocalTime(d.lastSeenAt, timezone)} (${minutes} min ago).\n\n` +
            (d.kind === "speaker"
              ? "Wake-ups it already has will still ring, but new ones and announcements won't reach it until it's back."
              : "The display is showing old information until it's back."),
          fns,
        );
        alerts++;
      }
      await db
        .update(householdDevices)
        .set({ offlineAlertedAt: now })
        .where(eq(householdDevices.id, d.id));
      continue;
    }

    if (status === "online" && d.offlineAlertedAt) {
      if (d.alertsEnabled) {
        await sendDeviceAlert(
          `HomeCal: ${d.name} is back online`,
          `${d.name} checked in again at ${formatLocalTime(d.lastSeenAt as Date, timezone)}.`,
          fns,
        );
        alerts++;
      }
      await db
        .update(householdDevices)
        .set({ offlineAlertedAt: null })
        .where(eq(householdDevices.id, d.id));
    }
  }
  return alerts;
}
