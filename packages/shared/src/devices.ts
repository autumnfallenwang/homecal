import { z } from "zod";

// ─── Phases 23–26 — household output devices ────────────────────────────────
// A "household device" is something in the house that shows or plays homecal
// output: the Kindle wall display (kind "display") or an old phone acting as a
// speaker (kind "speaker"). Not to be confused with `device_tokens`, which are
// iOS push tokens. See docs/design-plan.md, Phases 23–26.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const uuid = () => z.uuid();

export const DEVICE_KINDS = ["display", "speaker"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** Minutes without a check-in before a device counts as offline. */
export const DEFAULT_OFFLINE_AFTER_MINUTES: Record<DeviceKind, number> = {
  // A speaker syncs every 60 s, so five missed syncs.
  speaker: 5,
  // The Kindle refreshes every 600 s, so three missed refreshes.
  display: 30,
};

export const SPEAKER_LANGUAGES = ["en", "zh"] as const;
export const SPEAKER_SOUNDS = ["beeps", "chime", "none"] as const;
export type SpeakerSound = (typeof SPEAKER_SOUNDS)[number];

// Quiet hours: the night that starts on each listed weekday (0 = Sunday) runs
// from `start` to `end` in the household timezone. `end` before `start` means
// the window crosses midnight (21:00 → 07:00).
export const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(HHMM, "Time must be HH:MM (24-hour)"),
  end: z.string().regex(HHMM, "Time must be HH:MM (24-hour)"),
  days: z.array(z.number().int().min(0).max(6)).max(7),
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

export const displaySettingsSchema = z.object({
  /** Meta-refresh seconds for /dash; null keeps the page default. */
  refreshSeconds: z.number().int().min(0).max(3600).nullable(),
});
export type DisplaySettings = z.infer<typeof displaySettingsSchema>;

export const speakerSettingsSchema = z.object({
  language: z.enum(SPEAKER_LANGUAGES),
  volumes: z.object({
    alarm: z.number().int().min(0).max(15),
    music: z.number().int().min(0).max(15),
  }),
  quietHours: quietHoursSchema,
  /** Pinned agent version; null follows the latest bundled release. */
  agentVersion: z.string().regex(SEMVER, "Version must look like 1.2.3").nullable(),
});
export type SpeakerSettings = z.infer<typeof speakerSettingsSchema>;

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = { refreshSeconds: null };
export const DEFAULT_SPEAKER_SETTINGS: SpeakerSettings = {
  language: "en",
  volumes: { alarm: 10, music: 8 },
  quietHours: { enabled: false, start: "21:00", end: "07:00", days: [0, 1, 2, 3, 4] },
  agentVersion: null,
};

const deviceCommonFields = {
  name: z.string().trim().min(1).max(64),
  room: z.string().trim().max(64).nullable().optional(),
  memberIds: z.array(uuid()).max(50).optional(),
  offlineAfterMinutes: z.number().int().min(2).max(1440).optional(),
  alertsEnabled: z.boolean().optional(),
  /** Link an existing API key (e.g. the Kindle's) instead of minting a new one. */
  adoptApiKeyId: uuid().optional(),
};

export const createDeviceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("display"),
    ...deviceCommonFields,
    settings: displaySettingsSchema.partial().optional(),
  }),
  z.object({
    kind: z.literal("speaker"),
    ...deviceCommonFields,
    settings: speakerSettingsSchema.partial().optional(),
  }),
]);
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

// Settings are a partial patch here; the server merges them onto the stored
// settings and re-validates against the device's own kind.
export const updateDeviceSchema = z
  .object({
    name: deviceCommonFields.name.optional(),
    room: deviceCommonFields.room,
    memberIds: deviceCommonFields.memberIds,
    offlineAfterMinutes: deviceCommonFields.offlineAfterMinutes,
    alertsEnabled: deviceCommonFields.alertsEnabled,
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

export const updateDeviceAlertRecipientsSchema = z.object({
  recipientIds: z.array(uuid()).max(50),
});

export const DEVICE_STATUSES = ["never", "online", "stale", "offline"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/**
 * Pure online/stale/offline classification. Stale after half the offline
 * threshold, offline after the full threshold, "never" before the first
 * check-in (no alert for a device that hasn't been set up yet).
 */
export function deviceStatusFor(
  lastSeenAt: Date | string | null,
  offlineAfterMinutes: number,
  now: Date,
): DeviceStatus {
  if (!lastSeenAt) return "never";
  const ageMs = now.getTime() - new Date(lastSeenAt).getTime();
  const limitMs = offlineAfterMinutes * 60_000;
  if (ageMs > limitMs) return "offline";
  if (ageMs > limitMs / 2) return "stale";
  return "online";
}

// ─── Phase 24 — speaker sync protocol (agent ⇄ cluster) ─────────────────────
// One call, POST /api/v1/agent/sync. The phone sends a report, the cluster
// answers with the desired state. The phone opens every connection; there is
// no listener on the phone. See homeparentcontrol design A.5/A.6/A.26.

export const AGENT_SYNC_SCHEMA_VERSION = 1;

/** Something the phone played: a scheduled item or an announcement. */
export const rangReportSchema = z.object({
  id: z.string().min(1).max(200),
  at: z.iso.datetime(),
  ok: z.boolean(),
  error: z.string().max(500).optional(),
});
export type RangReport = z.infer<typeof rangReportSchema>;

export const agentSyncReportSchema = z.object({
  schemaVersion: z.literal(AGENT_SYNC_SCHEMA_VERSION),
  agentVersion: z.string().regex(SEMVER),
  status: z
    .object({
      battery: z.number().int().min(0).max(100).nullable().optional(),
      charging: z.boolean().nullable().optional(),
      temperatureC: z.number().min(-40).max(120).nullable().optional(),
      wifiRssi: z.number().int().min(-127).max(0).nullable().optional(),
      volumes: z
        .object({
          alarm: z.number().int().min(0).max(150).nullable().optional(),
          music: z.number().int().min(0).max(150).nullable().optional(),
        })
        .optional(),
      uptimeS: z.number().int().min(0).nullable().optional(),
      phoneTime: z.string().max(64).nullable().optional(),
    })
    .default({}),
  rang: z.array(rangReportSchema).max(200).default([]),
  /** Recent agent-side problems (failed update, rollback, TTS error). */
  errors: z.array(z.string().max(500)).max(20).default([]),
});
export type AgentSyncReport = z.infer<typeof agentSyncReportSchema>;

/** A sound+speech the phone must play at an exact instant, even offline. */
export interface DesiredScheduleItem {
  /** Stable id, echoed back in `rang`: `routine:<id>:<YYYY-MM-DD>` or `reminder:<id>`. */
  id: string;
  kind: "routine" | "reminder";
  /** UTC instant to play at. The phone needs no timezone or holiday logic. */
  at: string;
  sound: SpeakerSound;
  text: string;
}

/** A one-off message to play as soon as it arrives (Say now, Test sound, announce API). */
export interface DesiredAnnouncement {
  id: string;
  sound: SpeakerSound;
  text: string;
  expiresAt: string;
}

export interface DesiredState {
  schemaVersion: typeof AGENT_SYNC_SCHEMA_VERSION;
  deviceId: string;
  name: string;
  serverTime: string;
  nextPollAfterMs: number;
  settings: {
    language: SpeakerSettings["language"];
    volumes: SpeakerSettings["volumes"];
    /** Concrete quiet windows for the next days, as UTC instants. */
    quietWindows: { start: string; end: string }[];
  };
  agent: { version: string; url: string; sha256: string } | null;
  sounds: { name: Exclude<SpeakerSound, "none">; url: string; sha256: string }[];
  schedule: DesiredScheduleItem[];
  announcements: DesiredAnnouncement[];
  /** Rang ids the cluster has stored; the phone can drop them from its outbox. */
  ack: string[];
}

export const announceSchema = z.object({
  text: z.string().trim().min(1).max(300),
  sound: z.enum(SPEAKER_SOUNDS).optional(),
});
export type AnnounceInput = z.infer<typeof announceSchema>;

// ─── Phase 25 — routines (wake-ups, bedtime) ────────────────────────────────

export const createRoutineSchema = z.object({
  memberId: uuid(),
  title: z.string().trim().min(1).max(80),
  message: z.string().trim().max(300).default(""),
  time: z.string().regex(HHMM, "Time must be HH:MM (24-hour)"),
  /** 0 = Sunday … 6 = Saturday (JavaScript getDay). Series weekDays are Monday-based. */
  weekDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  sound: z.enum(SPEAKER_SOUNDS).default("beeps"),
  enabled: z.boolean().default(true),
  skipHolidays: z.boolean().default(true),
  includeBriefing: z.boolean().default(true),
  pausedUntil: z.iso.date().nullable().optional(),
});
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;

export const updateRoutineSchema = z
  .object({
    memberId: uuid().optional(),
    title: z.string().trim().min(1).max(80).optional(),
    message: z.string().trim().max(300).optional(),
    time: z.string().regex(HHMM, "Time must be HH:MM (24-hour)").optional(),
    weekDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    sound: z.enum(SPEAKER_SOUNDS).optional(),
    enabled: z.boolean().optional(),
    skipHolidays: z.boolean().optional(),
    includeBriefing: z.boolean().optional(),
    pausedUntil: z.iso.date().nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;

export const skipRoutineSchema = z.object({
  /** Local date to skip; omitted = the next occurrence. */
  date: z.iso.date().optional(),
});

// ─── Phase 26 — event reminders on speakers + announce API ──────────────────

export const REMINDER_DELIVERY_CHANNELS = ["email", "push", "speaker"] as const;
export type ReminderDeliveryChannel = (typeof REMINDER_DELIVERY_CHANNELS)[number];

export const updateReminderDeliverySchema = z.object({
  reminderDelivery: z.array(z.enum(REMINDER_DELIVERY_CHANNELS)).max(3),
});

export const speakerAnnounceSchema = z
  .object({
    text: z.string().trim().min(1).max(300),
    sound: z.enum(SPEAKER_SOUNDS).optional(),
    memberIds: z.array(uuid()).max(50).optional(),
    deviceIds: z.array(uuid()).max(50).optional(),
  })
  .refine((d) => (d.memberIds?.length ?? 0) + (d.deviceIds?.length ?? 0) > 0, {
    message: "Give memberIds or deviceIds",
  });
export type SpeakerAnnounceInput = z.infer<typeof speakerAnnounceSchema>;
