/**
 * Speaker sync (Phase 24): turn a speaker's report into stored state, and
 * build the desired state it should hold. Wake-up occurrences (Phase 25) and
 * event reminders (Phase 26) join the schedule here.
 */

import {
  AGENT_SYNC_SCHEMA_VERSION,
  type AgentSyncReport,
  type DesiredAnnouncement,
  type DesiredScheduleItem,
  type DesiredState,
  type SpeakerSound,
} from "@homecal/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { deviceAnnouncements, householdDevices } from "../db/schema.js";
import { log } from "../lib/logger.js";
import { listSounds, releaseFor } from "./agent-releases.js";
import { getOrCreateDigestSettings } from "./digest-settings.js";
import { type HouseholdDeviceRow, speakerSettingsOf } from "./household-devices.js";
import { quietWindowsFor } from "./local-time.js";

export const POLL_IDLE_MS = 60_000;
export const POLL_ATTENTION_MS = 15_000;
export const POLL_FAST_MS = 5_000;
/** How long the fast cadence lasts after a Say now is queued. */
export const FAST_WINDOW_MS = 2 * 60_000;
/** How long an announcement stays deliverable. */
export const ANNOUNCEMENT_TTL_MS = 2 * 60_000;

export type ScheduleProvider = (
  device: HouseholdDeviceRow,
  ctx: { now: Date; tz: string },
) => Promise<DesiredScheduleItem[]>;
export type RangHandler = (
  device: HouseholdDeviceRow,
  report: AgentSyncReport["rang"][number],
  now: Date,
) => Promise<void>;

// Later phases register what they add to a speaker's schedule and how to store
// what it rang, keyed by the id prefix (`routine:`, `reminder:`).
const scheduleProviders: ScheduleProvider[] = [];
const rangHandlers = new Map<string, RangHandler>();

export function registerScheduleProvider(p: ScheduleProvider) {
  scheduleProviders.push(p);
}
export function registerRangHandler(prefix: string, h: RangHandler) {
  rangHandlers.set(prefix, h);
}

registerRangHandler("announcement", async (device, r) => {
  const id = r.id.slice("announcement:".length);
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await db
    .update(deviceAnnouncements)
    .set({ playedAt: new Date(r.at), playOk: r.ok, playError: r.error ?? null })
    .where(and(eq(deviceAnnouncements.id, id), eq(deviceAnnouncements.deviceId, device.id)));
});

/**
 * Store a report: health status and what was rang. Returns the ids to
 * acknowledge — every id received, known or not, so the phone's outbox never
 * grows on ids this server doesn't track.
 */
export async function processReport(
  device: HouseholdDeviceRow,
  report: AgentSyncReport,
  now: Date,
): Promise<string[]> {
  await db
    .update(householdDevices)
    .set({
      lastSeenAt: now,
      lastStatus: {
        ...report.status,
        agentVersion: report.agentVersion,
        errors: report.errors,
        reportedAt: now.toISOString(),
      },
    })
    .where(eq(householdDevices.id, device.id));

  if (report.errors.length > 0) {
    log.warn(
      { event: "speaker.agent_errors", device_id: device.id, errors: report.errors },
      "speaker reported errors",
    );
  }

  for (const r of report.rang) {
    const prefix = r.id.split(":")[0];
    const handler = rangHandlers.get(prefix);
    if (!handler) continue;
    try {
      await handler(device, r, now);
    } catch (err) {
      log.error(
        { event: "speaker.rang_store_failed", device_id: device.id, err },
        "rang store failed",
      );
    }
  }
  return report.rang.map((r) => r.id);
}

async function pendingAnnouncements(deviceId: string, now: Date): Promise<DesiredAnnouncement[]> {
  const rows = await db
    .select()
    .from(deviceAnnouncements)
    .where(
      and(
        eq(deviceAnnouncements.deviceId, deviceId),
        isNull(deviceAnnouncements.playedAt),
        gt(deviceAnnouncements.expiresAt, now),
      ),
    );
  return rows.map((a) => ({
    id: `announcement:${a.id}`,
    sound: a.sound as SpeakerSound,
    text: a.text,
    expiresAt: a.expiresAt.toISOString(),
  }));
}

async function recentlyAnnounced(deviceId: string, now: Date): Promise<boolean> {
  const row = await db.query.deviceAnnouncements.findFirst({
    where: and(
      eq(deviceAnnouncements.deviceId, deviceId),
      gt(deviceAnnouncements.createdAt, new Date(now.getTime() - FAST_WINDOW_MS)),
    ),
  });
  return !!row;
}

/** Poll cadence: 5 s right after a Say now, 15 s while an admin is looking, else 60 s. */
export async function pollIntervalFor(device: HouseholdDeviceRow, now: Date): Promise<number> {
  if (await recentlyAnnounced(device.id, now)) return POLL_FAST_MS;
  if (device.attentionUntil && device.attentionUntil > now) return POLL_ATTENTION_MS;
  return POLL_IDLE_MS;
}

export async function buildDesiredState(
  device: HouseholdDeviceRow,
  now: Date,
  ack: string[] = [],
): Promise<DesiredState> {
  const settings = speakerSettingsOf(device);
  const { timezone: tz } = await getOrCreateDigestSettings();
  const release = releaseFor(settings.agentVersion);

  const schedule: DesiredScheduleItem[] = [];
  for (const provider of scheduleProviders) {
    schedule.push(...(await provider(device, { now, tz })));
  }
  schedule.sort((a, b) => a.at.localeCompare(b.at));

  return {
    schemaVersion: AGENT_SYNC_SCHEMA_VERSION,
    deviceId: device.id,
    name: device.name,
    serverTime: now.toISOString(),
    nextPollAfterMs: await pollIntervalFor(device, now),
    settings: {
      language: settings.language,
      volumes: settings.volumes,
      quietWindows: quietWindowsFor(settings.quietHours, tz, now).map((w) => ({
        start: w.start.toISOString(),
        end: w.end.toISOString(),
      })),
    },
    agent: release
      ? {
          version: release.version,
          url: `/api/v1/agent/releases/${release.version}`,
          sha256: release.sha256,
        }
      : null,
    sounds: listSounds().map((s) => ({
      name: s.name as "beeps" | "chime",
      url: `/api/v1/agent/sounds/${s.name}`,
      sha256: s.sha256,
    })),
    schedule,
    announcements: await pendingAnnouncements(device.id, now),
    ack,
  };
}

/** Queue a one-off message for a speaker (Say now, Test sound, announce API). */
export async function queueAnnouncement(opts: {
  deviceId: string;
  text: string;
  sound: SpeakerSound;
  source: string;
  createdById?: string | null;
  now?: Date;
}) {
  const now = opts.now ?? new Date();
  const [row] = await db
    .insert(deviceAnnouncements)
    .values({
      deviceId: opts.deviceId,
      text: opts.text,
      sound: opts.sound,
      source: opts.source,
      createdById: opts.createdById ?? null,
      expiresAt: new Date(now.getTime() + ANNOUNCEMENT_TTL_MS),
      createdAt: now,
    })
    .returning();
  return row;
}
