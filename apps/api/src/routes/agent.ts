import { agentSyncReportSchema } from "@homecal/shared";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { requireDeviceAuth } from "../middleware/device-auth.js";
import { getRelease, getSound, readBundled } from "../services/agent-releases.js";
import type { HouseholdDeviceRow } from "../services/household-devices.js";
import { buildDesiredState, processReport } from "../services/speaker-sync.js";
// Register what routines (Phase 25) and event reminders (Phase 26) add to a
// speaker's schedule, and how their rang reports are stored.
import "../services/routines.js";
import "../services/speaker-reminders.js";

type Session = typeof auth.$Infer.Session;

/**
 * Calls made by speakers themselves (Phase 24), authenticated with the
 * device's own key. The phone opens every connection; nothing calls the phone.
 */
export const agentApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"]; device: HouseholdDeviceRow };
}>();

agentApp.use(requireDeviceAuth);

// POST /sync — report in, desired state out. The sync is the heartbeat.
agentApp.post("/sync", async (c) => {
  const device = c.get("device");
  if (device.kind !== "speaker") {
    return c.json({ error: "Only speakers sync", code: "NOT_A_SPEAKER" }, 403);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = agentSyncReportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const now = new Date();
  const ack = await processReport(device, parsed.data, now);
  return c.json(await buildDesiredState(device, now, ack));
});

// GET /releases/:version — agent code, checked against the sha256 in the desired state
agentApp.get("/releases/:version", (c) => {
  const release = getRelease(c.req.param("version"));
  if (!release) return c.json({ error: "Not found" }, 404);
  c.header("Content-Type", "text/x-python; charset=utf-8");
  return c.body(new Uint8Array(readBundled(release)));
});

// GET /sounds/:name — built-in tones
agentApp.get("/sounds/:name", (c) => {
  const sound = getSound(c.req.param("name"));
  if (!sound) return c.json({ error: "Not found" }, 404);
  c.header("Content-Type", "audio/wav");
  return c.body(new Uint8Array(readBundled(sound)));
});
