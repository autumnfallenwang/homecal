/**
 * Household devices (Phase 23): the Kindle wall display and speaker phones.
 * Data access, per-device keys, check-ins and the response shape shared by the
 * admin API and the agent sync. See docs/design-plan.md, Phases 23–26.
 */

import { randomBytes } from "node:crypto";
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_OFFLINE_AFTER_MINUTES,
  DEFAULT_SPEAKER_SETTINGS,
  type DeviceKind,
  type DeviceStatus,
  type DisplaySettings,
  deviceStatusFor,
  displaySettingsSchema,
  type SpeakerSettings,
  speakerSettingsSchema,
} from "@homecal/shared";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { apikeys, householdDeviceMembers, householdDevices, users } from "../db/schema.js";

export type HouseholdDeviceRow = typeof householdDevices.$inferSelect;

/** Fixed identity of the service account that owns every device key. */
export const HOME_DEVICES_EMAIL = "home-devices@service.homecal.local";
const HOME_DEVICES_NAME = "Home devices";

/** Check-ins write lastSeenAt at most this often per device. */
const CHECK_IN_WRITE_INTERVAL_MS = 30_000;

// ─── Settings ────────────────────────────────────────────────────────────────

/**
 * Merge a stored/partial settings object onto the kind's defaults and validate.
 * Returns the error message on failure so routes can answer 400.
 */
export function resolveSettings(
  kind: DeviceKind,
  stored: unknown,
  patch: Record<string, unknown> = {},
): { ok: true; settings: DisplaySettings | SpeakerSettings } | { ok: false; error: string } {
  const base = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  if (kind === "display") {
    const parsed = displaySettingsSchema.safeParse({
      ...DEFAULT_DISPLAY_SETTINGS,
      ...base,
      ...patch,
    });
    return parsed.success
      ? { ok: true, settings: parsed.data }
      : { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }
  const merged = {
    ...DEFAULT_SPEAKER_SETTINGS,
    ...base,
    ...patch,
    volumes: {
      ...DEFAULT_SPEAKER_SETTINGS.volumes,
      ...((base.volumes as object) ?? {}),
      ...((patch.volumes as object) ?? {}),
    },
    quietHours: {
      ...DEFAULT_SPEAKER_SETTINGS.quietHours,
      ...((base.quietHours as object) ?? {}),
      ...((patch.quietHours as object) ?? {}),
    },
  };
  const parsed = speakerSettingsSchema.safeParse(merged);
  return parsed.success
    ? { ok: true, settings: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
}

export function speakerSettingsOf(device: HouseholdDeviceRow): SpeakerSettings {
  const r = resolveSettings("speaker", device.settings);
  return r.ok ? (r.settings as SpeakerSettings) : DEFAULT_SPEAKER_SETTINGS;
}

export function displaySettingsOf(device: HouseholdDeviceRow): DisplaySettings {
  const r = resolveSettings("display", device.settings);
  return r.ok ? (r.settings as DisplaySettings) : DEFAULT_DISPLAY_SETTINGS;
}

export function defaultSettingsFor(kind: DeviceKind): DisplaySettings | SpeakerSettings {
  return kind === "display" ? DEFAULT_DISPLAY_SETTINGS : DEFAULT_SPEAKER_SETTINGS;
}

export function defaultOfflineAfter(kind: DeviceKind): number {
  return DEFAULT_OFFLINE_AFTER_MINUTES[kind];
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export function getDevice(id: string): Promise<HouseholdDeviceRow | undefined> {
  return db.query.householdDevices.findFirst({ where: eq(householdDevices.id, id) });
}

export function findDeviceByApiKeyId(apikeyId: string): Promise<HouseholdDeviceRow | undefined> {
  return db.query.householdDevices.findFirst({ where: eq(householdDevices.apikeyId, apikeyId) });
}

export async function getDeviceMemberIds(deviceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: householdDeviceMembers.userId })
    .from(householdDeviceMembers)
    .where(eq(householdDeviceMembers.deviceId, deviceId));
  return rows.map((r) => r.userId);
}

/** Speakers that serve any of the given members. */
export async function speakersServing(memberIds: string[]): Promise<HouseholdDeviceRow[]> {
  if (memberIds.length === 0) return [];
  const links = await db
    .select({ deviceId: householdDeviceMembers.deviceId })
    .from(householdDeviceMembers)
    .where(inArray(householdDeviceMembers.userId, memberIds));
  const ids = [...new Set(links.map((l) => l.deviceId))];
  if (ids.length === 0) return [];
  return db
    .select()
    .from(householdDevices)
    .where(and(inArray(householdDevices.id, ids), eq(householdDevices.kind, "speaker")));
}

export interface DeviceView {
  id: string;
  kind: DeviceKind;
  name: string;
  room: string | null;
  memberIds: string[];
  settings: DisplaySettings | SpeakerSettings;
  offlineAfterMinutes: number;
  alertsEnabled: boolean;
  lastSeenAt: string | null;
  status: DeviceStatus;
  lastStatus: unknown;
  key: { id: string; start: string | null; prefix: string | null; ownedByDevices: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

/** Every device, shaped for the admin UI (members, key summary, computed status). */
export async function listDeviceViews(now = new Date()): Promise<DeviceView[]> {
  const rows = await db.select().from(householdDevices).orderBy(asc(householdDevices.name));
  return shapeDevices(rows, now);
}

export async function getDeviceView(id: string, now = new Date()): Promise<DeviceView | null> {
  const row = await getDevice(id);
  if (!row) return null;
  const [view] = await shapeDevices([row], now);
  return view;
}

async function shapeDevices(rows: HouseholdDeviceRow[], now: Date): Promise<DeviceView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const memberRows = await db
    .select()
    .from(householdDeviceMembers)
    .where(inArray(householdDeviceMembers.deviceId, ids));
  const keyIds = rows.map((r) => r.apikeyId).filter((k): k is string => !!k);
  const keyRows = keyIds.length
    ? await db
        .select({
          id: apikeys.id,
          start: apikeys.start,
          prefix: apikeys.prefix,
          userId: apikeys.userId,
        })
        .from(apikeys)
        .where(inArray(apikeys.id, keyIds))
    : [];
  const owner = await findHomeDevicesAccount();
  const keyById = new Map(keyRows.map((k) => [k.id, k]));

  return rows.map((r) => {
    const kind = r.kind as DeviceKind;
    const resolved = resolveSettings(kind, r.settings);
    const key = r.apikeyId ? keyById.get(r.apikeyId) : undefined;
    return {
      id: r.id,
      kind,
      name: r.name,
      room: r.room,
      memberIds: memberRows.filter((m) => m.deviceId === r.id).map((m) => m.userId),
      settings: resolved.ok ? resolved.settings : defaultSettingsFor(kind),
      offlineAfterMinutes: r.offlineAfterMinutes,
      alertsEnabled: r.alertsEnabled,
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
      status: deviceStatusFor(r.lastSeenAt, r.offlineAfterMinutes, now),
      lastStatus: r.lastStatus ?? null,
      key: key
        ? {
            id: key.id,
            start: key.start,
            prefix: key.prefix,
            ownedByDevices: !!owner && key.userId === owner.id,
          }
        : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function setDeviceMembers(deviceId: string, memberIds: string[]): Promise<void> {
  const unique = [...new Set(memberIds)];
  await db.delete(householdDeviceMembers).where(eq(householdDeviceMembers.deviceId, deviceId));
  if (unique.length > 0) {
    await db.insert(householdDeviceMembers).values(unique.map((userId) => ({ deviceId, userId })));
  }
}

/** Members (non-service) among the given ids — used to reject unknown ids with 400. */
export async function existingMemberIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.isService, false)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Record a check-in. Writes lastSeenAt at most every 30 s per device so a fast
 * polling cadence doesn't turn every request into a write.
 */
export async function recordCheckIn(device: HouseholdDeviceRow, now = new Date()): Promise<void> {
  if (
    device.lastSeenAt &&
    now.getTime() - device.lastSeenAt.getTime() < CHECK_IN_WRITE_INTERVAL_MS
  ) {
    return;
  }
  await db
    .update(householdDevices)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(householdDevices.id, device.id),
        or(
          isNull(householdDevices.lastSeenAt),
          lt(householdDevices.lastSeenAt, new Date(now.getTime() - CHECK_IN_WRITE_INTERVAL_MS)),
        ),
      ),
    );
}

// ─── Keys ────────────────────────────────────────────────────────────────────

function findHomeDevicesAccount() {
  return db.query.users.findFirst({ where: eq(users.email, HOME_DEVICES_EMAIL) });
}

/** The service account that owns device keys, created on first use. */
export async function getOrCreateHomeDevicesAccount(): Promise<{ id: string }> {
  const existing = await findHomeDevicesAccount();
  if (existing) return existing;
  try {
    const created = await auth.api.createUser({
      body: {
        name: HOME_DEVICES_NAME,
        email: HOME_DEVICES_EMAIL,
        // Never used: the credential is the per-device API key.
        password: randomBytes(32).toString("hex"),
        role: "user",
        data: { color: "#6b7280", isService: true },
      },
    });
    return { id: created.user.id };
  } catch (err) {
    // A concurrent first use may have created it; re-read before giving up.
    const raced = await findHomeDevicesAccount();
    if (raced) return raced;
    throw err;
  }
}

/** Key names are capped at 32 chars by the apiKey plugin. */
function keyNameFor(deviceName: string): string {
  const slug =
    deviceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "device";
  return `device-${slug}`.slice(0, 32);
}

/** Mint a never-expiring key for a device. Returns the plaintext once. */
export async function mintDeviceKey(deviceName: string): Promise<{ id: string; key: string }> {
  const owner = await getOrCreateHomeDevicesAccount();
  // Trusted server-side call — no headers, same as /admin/api-keys.
  const created = await auth.api.createApiKey({
    body: { name: keyNameFor(deviceName), userId: owner.id },
  });
  return { id: created.id, key: created.key };
}

export async function deleteKey(apikeyId: string | null): Promise<void> {
  if (!apikeyId) return;
  await db.delete(apikeys).where(eq(apikeys.id, apikeyId));
}

/** API keys not yet linked to any device — candidates for "adopt existing key". */
export async function listAdoptableKeys() {
  const linked = await db.select({ apikeyId: householdDevices.apikeyId }).from(householdDevices);
  const linkedIds = new Set(linked.map((l) => l.apikeyId).filter(Boolean));
  const rows = await db
    .select({
      id: apikeys.id,
      name: apikeys.name,
      start: apikeys.start,
      prefix: apikeys.prefix,
      lastRequest: apikeys.lastRequest,
      ownerName: users.name,
      ownerIsService: users.isService,
    })
    .from(apikeys)
    .innerJoin(users, eq(apikeys.userId, users.id))
    .orderBy(asc(users.name));
  return rows.filter((r) => !linkedIds.has(r.id) && r.ownerIsService);
}
