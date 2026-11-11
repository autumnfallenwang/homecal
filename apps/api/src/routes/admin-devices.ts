import {
  announceSchema,
  createDeviceSchema,
  type DeviceKind,
  updateDeviceAlertRecipientsSchema,
  updateDeviceSchema,
} from "@homecal/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { apikeys, householdDevices } from "../db/schema.js";
import { getRelease, listReleases } from "../services/agent-releases.js";
import { getDeviceAlertRecipients, setDeviceAlertRecipients } from "../services/device-health.js";
import { getOrCreateDigestSettings } from "../services/digest-settings.js";
import {
  defaultOfflineAfter,
  deleteKey,
  existingMemberIds,
  findDeviceByApiKeyId,
  getDevice,
  getDeviceView,
  listAdoptableKeys,
  listDeviceViews,
  mintDeviceKey,
  resolveSettings,
  setDeviceMembers,
  speakerSettingsOf,
} from "../services/household-devices.js";
import { isQuietAt, localTimeOf, quietWindowsFor } from "../services/local-time.js";
import { POLL_ATTENTION_MS, queueAnnouncement } from "../services/speaker-sync.js";

type Session = typeof auth.$Infer.Session;

/**
 * Admin device management (Phase 23), mounted at `/admin/devices` inside
 * `adminApp`, which already enforces requireAuth + requireAdmin.
 */
export const adminDevicesApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

const idParam = z.uuid();

async function validMembers(memberIds: string[] | undefined): Promise<string | null> {
  if (!memberIds || memberIds.length === 0) return null;
  const known = await existingMemberIds(memberIds);
  const unknown = memberIds.filter((id) => !known.has(id));
  return unknown.length > 0 ? "Unknown member id" : null;
}

// GET / — every device plus the alert recipients
adminDevicesApp.get("/", async (c) => {
  const [devices, recipients] = await Promise.all([listDeviceViews(), getDeviceAlertRecipients()]);
  return c.json({ devices, alertRecipientIds: recipients.map((r) => r.id) });
});

// GET /adoptable-keys — service-account keys not linked to a device yet
adminDevicesApp.get("/adoptable-keys", async (c) => {
  return c.json(await listAdoptableKeys());
});

// GET /agent-releases — speaker agent versions bundled in this API image
adminDevicesApp.get("/agent-releases", (c) => {
  return c.json(listReleases().map((r) => ({ version: r.version, sha256: r.sha256 })));
});

// PATCH /alerts — who gets device alerts
adminDevicesApp.patch("/alerts", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = updateDeviceAlertRecipientsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const bad = await validMembers(parsed.data.recipientIds);
  if (bad) return c.json({ error: bad }, 400);
  await setDeviceAlertRecipients(parsed.data.recipientIds);
  const recipients = await getDeviceAlertRecipients();
  return c.json({ alertRecipientIds: recipients.map((r) => r.id) });
});

// POST / — register a device. Mints its key (returned once) unless adopting one.
adminDevicesApp.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const input = parsed.data;
  const kind: DeviceKind = input.kind;

  const settings = resolveSettings(kind, {}, (input.settings ?? {}) as Record<string, unknown>);
  if (!settings.ok) return c.json({ error: settings.error }, 400);
  const bad = await validMembers(input.memberIds);
  if (bad) return c.json({ error: bad }, 400);

  let apikeyId: string;
  let plaintext: string | null = null;
  if (input.adoptApiKeyId) {
    const key = await db.query.apikeys.findFirst({ where: eq(apikeys.id, input.adoptApiKeyId) });
    if (!key) return c.json({ error: "API key not found" }, 404);
    if (await findDeviceByApiKeyId(key.id)) {
      return c.json({ error: "That key already belongs to a device" }, 409);
    }
    apikeyId = key.id;
  } else {
    const minted = await mintDeviceKey(input.name);
    apikeyId = minted.id;
    plaintext = minted.key;
  }

  const [row] = await db
    .insert(householdDevices)
    .values({
      kind,
      name: input.name,
      room: input.room ?? null,
      apikeyId,
      settings: settings.settings,
      offlineAfterMinutes: input.offlineAfterMinutes ?? defaultOfflineAfter(kind),
      alertsEnabled: input.alertsEnabled ?? true,
    })
    .returning();
  await setDeviceMembers(row.id, input.memberIds ?? []);

  return c.json({ device: await getDeviceView(row.id), key: plaintext }, 201);
});

// GET /:id — one device
adminDevicesApp.get("/:id", async (c) => {
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Not found" }, 404);
  const view = await getDeviceView(id.data);
  if (!view) return c.json({ error: "Not found" }, 404);
  return c.json(view);
});

// PATCH /:id — rename, move rooms, change members / thresholds / settings
adminDevicesApp.patch("/:id", async (c) => {
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Not found" }, 404);
  const device = await getDevice(id.data);
  if (!device) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const parsed = updateDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const patch = parsed.data;

  let nextSettings = device.settings;
  if (patch.settings) {
    const resolved = resolveSettings(device.kind as DeviceKind, device.settings, patch.settings);
    if (!resolved.ok) return c.json({ error: resolved.error }, 400);
    const pinned = (resolved.settings as { agentVersion?: string | null }).agentVersion;
    if (pinned && !getRelease(pinned)) {
      return c.json({ error: `Agent version ${pinned} is not bundled in this server` }, 400);
    }
    nextSettings = resolved.settings;
  }
  const bad = await validMembers(patch.memberIds);
  if (bad) return c.json({ error: bad }, 400);

  await db
    .update(householdDevices)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.room !== undefined ? { room: patch.room } : {}),
      ...(patch.offlineAfterMinutes !== undefined
        ? { offlineAfterMinutes: patch.offlineAfterMinutes }
        : {}),
      ...(patch.alertsEnabled !== undefined ? { alertsEnabled: patch.alertsEnabled } : {}),
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(householdDevices.id, device.id));
  if (patch.memberIds !== undefined) await setDeviceMembers(device.id, patch.memberIds);

  return c.json(await getDeviceView(device.id));
});

// POST /:id/rotate-key — replace the device's key. The old key stops working
// immediately; the device is offline until the new key is put on it.
adminDevicesApp.post("/:id/rotate-key", async (c) => {
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Not found" }, 404);
  const device = await getDevice(id.data);
  if (!device) return c.json({ error: "Not found" }, 404);

  const minted = await mintDeviceKey(device.name);
  const oldKeyId = device.apikeyId;
  await db
    .update(householdDevices)
    .set({ apikeyId: minted.id, updatedAt: new Date() })
    .where(eq(householdDevices.id, device.id));
  await deleteKey(oldKeyId);

  return c.json({ device: await getDeviceView(device.id), key: minted.key });
});

// DELETE /:id/key — revoke the device's key, keep the device record
adminDevicesApp.delete("/:id/key", async (c) => {
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Not found" }, 404);
  const device = await getDevice(id.data);
  if (!device) return c.json({ error: "Not found" }, 404);
  await deleteKey(device.apikeyId);
  return c.json(await getDeviceView(device.id));
});

// DELETE /:id — remove the device and revoke its key
adminDevicesApp.delete("/:id", async (c) => {
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Not found" }, 404);
  const device = await getDevice(id.data);
  if (!device) return c.json({ error: "Not found" }, 404);
  await db.delete(householdDevices).where(eq(householdDevices.id, device.id));
  await deleteKey(device.apikeyId);
  return c.json({ ok: true });
});

// POST /:id/announce — Say now / Test sound. Refused during quiet hours, so a
// message typed at night never wakes the room; delivered within ~15 s while
// the drawer is open (attention cadence), then every 5 s for 2 minutes.
adminDevicesApp.post("/:id/announce", async (c) => {
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Not found" }, 404);
  const device = await getDevice(id.data);
  if (!device) return c.json({ error: "Not found" }, 404);
  if (device.kind !== "speaker") {
    return c.json({ error: "Only speakers can play announcements" }, 400);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = announceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const now = new Date();
  const { timezone } = await getOrCreateDigestSettings();
  const windows = quietWindowsFor(speakerSettingsOf(device).quietHours, timezone, now);
  const quiet = isQuietAt(windows, now);
  if (quiet) {
    return c.json(
      {
        error: `${device.name} is in quiet hours until ${localTimeOf(quiet.end, timezone)}`,
        code: "QUIET_HOURS",
      },
      409,
    );
  }

  const row = await queueAnnouncement({
    deviceId: device.id,
    text: parsed.data.text,
    sound: parsed.data.sound ?? "chime",
    source: "admin",
    createdById: c.get("user").id,
    now,
  });
  return c.json({ id: row.id, expiresAt: row.expiresAt.toISOString() }, 201);
});

// POST /:id/attention — the admin has this speaker open; poll faster for 2 min.
adminDevicesApp.post("/:id/attention", async (c) => {
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Not found" }, 404);
  const device = await getDevice(id.data);
  if (!device) return c.json({ error: "Not found" }, 404);
  const until = new Date(Date.now() + 2 * 60_000);
  await db
    .update(householdDevices)
    .set({ attentionUntil: until })
    .where(eq(householdDevices.id, device.id));
  return c.json({ attentionUntil: until.toISOString(), pollMs: POLL_ATTENTION_MS });
});
