/**
 * Daily digest scheduler (Phase 21) — mirrors reminder-scheduler.ts. A 60s tick
 * sends the family digest once per day when the local clock has reached the
 * configured send time. `DispatchFns` (email + clock) are injectable for tests.
 */

import { log } from "../lib/logger.js";
import { type DigestEventInput, renderDigest, renderDigestHtml } from "./digest.js";
import {
  getDigestRecipients,
  getOrCreateDigestSettings,
  isDigestDue,
  markDigestSent,
} from "./digest-settings.js";
import { type EmailConfig, getEmailConfig, sendDigestEmail } from "./email.js";
import { getLocalParts, getTodayEvents } from "./today.js";

export interface DigestDispatchFns {
  emailFn?: (
    config: EmailConfig,
    to: string,
    subject: string,
    body: string,
    html?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  now?: () => Date;
}

/** Today's non-private family events shaped for the digest, in the given zone.
 *  Shared by the scheduled/test dispatch and the printable digest page. */
export async function buildTodayDigestEvents(tz: string, now: Date): Promise<DigestEventInput[]> {
  const { todayEvents } = await getTodayEvents({ tz, now, requesterId: null });
  return todayEvents.map((e) => ({
    title: e.title,
    start: new Date(e.start),
    end: new Date(e.end),
    location: e.location,
    assignees: e.assignees.map((a) => ({ name: a.user.name, color: a.user.color })),
  }));
}

/**
 * Build and send today's digest to the current recipients. Ignores schedule and
 * dedup — used by both the scheduled tick (after the due check) and the admin
 * test-send. Returns how many recipients were targeted and how many emails sent.
 */
export async function dispatchDigest(
  fns?: DigestDispatchFns,
): Promise<{ recipients: number; sent: number }> {
  const now = fns?.now?.() ?? new Date();
  const settings = await getOrCreateDigestSettings();
  const recipients = await getDigestRecipients();
  if (recipients.length === 0) return { recipients: 0, sent: 0 };

  const digestEvents = await buildTodayDigestEvents(settings.timezone, now);

  const { subject, text } = renderDigest({ events: digestEvents, tz: settings.timezone, now });
  const html = renderDigestHtml({ events: digestEvents, tz: settings.timezone, now });

  const emailConfig = getEmailConfig();
  const send = fns?.emailFn ?? sendDigestEmail;
  let sent = 0;
  for (const r of recipients) {
    if (!emailConfig && !fns?.emailFn) {
      log.warn(
        { event: "digest.dispatch.email_skipped", reason: "email_not_configured" },
        "email not configured, skipping digest",
      );
      continue;
    }
    const config = emailConfig as EmailConfig;
    const result = await send(config, r.email, subject, text, html);
    if (result.success) {
      sent++;
      log.info(
        { event: "digest.dispatch.email", event_count: digestEvents.length },
        "digest email dispatched",
      );
    } else {
      log.error(
        { event: "digest.dispatch.email_fail", err: result.error },
        "digest email send failed",
      );
    }
  }
  return { recipients: recipients.length, sent };
}

/**
 * One scheduler tick: if the digest is enabled and the local clock has reached
 * the send time (and it hasn't gone out today), dispatch it and stamp the date.
 * The stamp is written regardless of send outcome, so a transient email failure
 * is not retried within the same day. Returns the number of emails sent.
 */
export async function checkDueDigest(fns?: DigestDispatchFns): Promise<number> {
  const now = fns?.now?.() ?? new Date();
  const settings = await getOrCreateDigestSettings();
  if (!isDigestDue(settings, now)) return 0;

  const { sent } = await dispatchDigest(fns);

  const p = getLocalParts(now, settings.timezone);
  await markDigestSent(`${p.year}-${p.month}-${p.day}`);
  return sent;
}

export function startDigestScheduler(intervalMs = 60000): NodeJS.Timeout {
  log.info(
    { event: "digest.scheduler.start", interval_ms: intervalMs },
    "digest scheduler started",
  );

  checkDueDigest().catch((err) =>
    log.error({ event: "digest.scheduler.error", err }, "digest scheduler tick failed"),
  );

  return setInterval(() => {
    checkDueDigest().catch((err) =>
      log.error({ event: "digest.scheduler.error", err }, "digest scheduler tick failed"),
    );
  }, intervalMs);
}
