/**
 * Daily digest data access (Phase 21). The family-level config is a single
 * `digest_settings` row (created on first use); recipients are tracked per-user
 * via `users.receivesDailyDigest`. Shared by the scheduler and the admin API.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { digestSettings, users } from "../db/schema.js";
import { getLocalParts } from "./today.js";

export type DigestSettingsRow = typeof digestSettings.$inferSelect;

/** Load the single family digest config, creating it with defaults on first use. */
export async function getOrCreateDigestSettings(): Promise<DigestSettingsRow> {
  const existing = await db.select().from(digestSettings).limit(1);
  if (existing[0]) return existing[0];
  // Insert the singleton row; a concurrent insert conflicts on the unique
  // `singleton` constraint and is ignored, so re-select whichever row won.
  await db.insert(digestSettings).values({}).onConflictDoNothing();
  const [row] = await db.select().from(digestSettings).limit(1);
  if (!row) throw new Error("failed to create digest settings");
  return row;
}

/** Apply a partial update to the family config (enabled/sendAt/timezone). */
export async function saveDigestSettings(patch: {
  enabled?: boolean;
  sendAt?: string;
  timezone?: string;
}): Promise<DigestSettingsRow> {
  const current = await getOrCreateDigestSettings();
  const [updated] = await db
    .update(digestSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(digestSettings.id, current.id))
    .returning();
  return updated;
}

/** Stamp the once-per-day dedup marker (a local YYYY-MM-DD date). */
export async function markDigestSent(localDate: string): Promise<void> {
  const current = await getOrCreateDigestSettings();
  await db
    .update(digestSettings)
    .set({ lastSentOn: localDate, updatedAt: new Date() })
    .where(eq(digestSettings.id, current.id));
}

/** Members who receive the digest — opted-in, excluding service accounts. */
export function getDigestRecipients(): Promise<{ id: string; email: string }[]> {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.receivesDailyDigest, true), eq(users.isService, false)));
}

/**
 * Set the recipient list: `receivesDailyDigest = (id ∈ ids)` for every
 * non-service user. Two bulk updates keep it correct even when `ids` is empty.
 */
export async function setDigestRecipients(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  const all = await db.select({ id: users.id }).from(users).where(eq(users.isService, false));
  const optIn = all.filter((u) => idSet.has(u.id)).map((u) => u.id);
  const optOut = all.filter((u) => !idSet.has(u.id)).map((u) => u.id);
  if (optIn.length > 0) {
    await db.update(users).set({ receivesDailyDigest: true }).where(inArray(users.id, optIn));
  }
  if (optOut.length > 0) {
    await db.update(users).set({ receivesDailyDigest: false }).where(inArray(users.id, optOut));
  }
}

/**
 * Pure "should the digest fire right now?" check: enabled, local time has
 * reached `sendAt`, and it hasn't already gone out today. Zero-padded HH:MM
 * compares correctly as strings. Local date/time computed in the family zone.
 */
// The scheduled digest fires only within a short window starting at `sendAt` —
// wide enough that a delayed 60s tick (or a brief restart) can't skip the day,
// narrow enough that merely *enabling* the digest later in the day never sends.
// Only the clock reaching the send time (or an explicit "Send test") dispatches.
const SEND_WINDOW_MINUTES = 5;

export function isDigestDue(
  settings: Pick<DigestSettingsRow, "enabled" | "sendAt" | "timezone" | "lastSentOn">,
  now: Date,
): boolean {
  if (!settings.enabled) return false;
  const p = getLocalParts(now, settings.timezone);
  const localDate = `${p.year}-${p.month}-${p.day}`;
  if (settings.lastSentOn === localDate) return false; // already sent today
  const nowMinutes = Number(p.hour) * 60 + Number(p.minute);
  const [h, m] = settings.sendAt.split(":").map(Number);
  const sendMinutes = h * 60 + m;
  return nowMinutes >= sendMinutes && nowMinutes < sendMinutes + SEND_WINDOW_MINUTES;
}
