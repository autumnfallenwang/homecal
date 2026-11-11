import { speakerAnnounceSchema } from "@homecal/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { householdDevices } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnnounceRateLimiter } from "../middleware/rate-limit.js";
import { getOrCreateDigestSettings } from "../services/digest-settings.js";
import {
  existingMemberIds,
  type HouseholdDeviceRow,
  speakerSettingsOf,
  speakersServing,
} from "../services/household-devices.js";
import { isQuietAt, quietWindowsFor } from "../services/local-time.js";
import { queueAnnouncement } from "../services/speaker-sync.js";

type Session = typeof auth.$Infer.Session;

/**
 * Speaker announce API for other home apps (Phase 26): homework,
 * homeparentcontrol, scripts. Callers are admins or service accounts; a
 * message goes to the given speakers and/or the speakers serving the given
 * members, except those in quiet hours.
 */
export const speakerApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

speakerApp.use(requireAuth);

// Skipped under NODE_ENV=test like the global limiter; tests build their own.
const announceLimiter: MiddlewareHandler =
  process.env.NODE_ENV === "test" ? (_c, next) => next() : createAnnounceRateLimiter();

// GET /speakers — speakers any member can pick for an event reminder (Phase 26).
// Names and rooms only; device management stays admin-only.
speakerApp.get("/speakers", async (c) => {
  const rows = await db
    .select({ id: householdDevices.id, name: householdDevices.name, room: householdDevices.room })
    .from(householdDevices)
    .where(eq(householdDevices.kind, "speaker"))
    .orderBy(householdDevices.name);
  return c.json(rows);
});

speakerApp.post("/announce", announceLimiter, async (c) => {
  const user = c.get("user") as Session["user"] & { isService?: boolean };
  if (user.role !== "admin" && !user.isService) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = speakerAnnounceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const { text, sound, memberIds = [], deviceIds = [] } = parsed.data;

  const known = await existingMemberIds(memberIds);
  if (memberIds.some((id) => !known.has(id))) {
    return c.json({ error: "Unknown member id" }, 400);
  }
  const direct: HouseholdDeviceRow[] = deviceIds.length
    ? await db
        .select()
        .from(householdDevices)
        .where(and(inArray(householdDevices.id, deviceIds), eq(householdDevices.kind, "speaker")))
    : [];
  if (direct.length !== new Set(deviceIds).size) {
    return c.json({ error: "Unknown speaker id" }, 400);
  }
  const targets = new Map<string, HouseholdDeviceRow>();
  for (const d of [...direct, ...(await speakersServing(memberIds))]) targets.set(d.id, d);
  if (targets.size === 0) {
    return c.json({ error: "No speaker serves those members", code: "NO_SPEAKER" }, 409);
  }

  const now = new Date();
  const { timezone } = await getOrCreateDigestSettings();
  const queued: { deviceId: string; announcementId: string }[] = [];
  const quiet: string[] = [];
  for (const d of targets.values()) {
    const windows = quietWindowsFor(speakerSettingsOf(d).quietHours, timezone, now);
    if (isQuietAt(windows, now)) {
      quiet.push(d.id);
      continue;
    }
    const row = await queueAnnouncement({
      deviceId: d.id,
      text,
      sound: sound ?? "chime",
      source: user.isService ? `api:${user.name}` : "api",
      createdById: user.id,
      now,
    });
    queued.push({ deviceId: d.id, announcementId: row.id });
  }
  if (queued.length === 0) {
    return c.json(
      { error: "Every target speaker is in quiet hours", code: "QUIET_HOURS", quiet },
      409,
    );
  }
  return c.json({ queued, quiet }, 201);
});
