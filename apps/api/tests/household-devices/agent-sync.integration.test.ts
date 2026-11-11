import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.js";
import {
  asKey,
  asUser,
  createDevice,
  ctx,
  type DeviceViewJson,
  req,
  seedFamily,
  useHouseholdDb,
} from "./helpers.js";

useHouseholdDb();

const SYNC = "/api/v1/agent/sync";
const AGENT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../speaker-agent",
);

function report(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    agentVersion: "1.0.0",
    status: { battery: 87, charging: true, wifiRssi: -71, volumes: { alarm: 7, music: 2 } },
    rang: [],
    errors: [],
    ...over,
  };
}

interface DesiredJson {
  schemaVersion: number;
  deviceId: string;
  nextPollAfterMs: number;
  settings: {
    language: string;
    volumes: { alarm: number; music: number };
    quietWindows: { start: string; end: string }[];
  };
  agent: { version: string; url: string; sha256: string } | null;
  sounds: { name: string; url: string; sha256: string }[];
  schedule: unknown[];
  announcements: { id: string; text: string; sound: string; expiresAt: string }[];
  ack: string[];
}

async function sync(key: string, body: unknown = report()) {
  const res = await asKey(key, SYNC, "POST", body);
  return { res, json: res.status === 200 ? ((await res.json()) as DesiredJson) : null };
}

async function speaker(settings: Record<string, unknown> = {}) {
  const family = await seedFamily();
  const { device, key } = await createDevice(family.admin.cookie, {
    kind: "speaker",
    name: "Kids' room",
    memberIds: [family.carol.id],
    settings,
  });
  return { ...family, device, key: key as string };
}

/** A quiet-hours window around now in the household timezone (default America/New_York). */
function quietAroundNow() {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  return {
    enabled: true,
    start: fmt(new Date(Date.now() - 60 * 60_000)),
    end: fmt(new Date(Date.now() + 60 * 60_000)),
    days: [0, 1, 2, 3, 4, 5, 6],
  };
}

describe("POST /agent/sync — auth", () => {
  it("rejects a missing or invalid key with 401", async () => {
    const res = await req(SYNC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report()),
    });
    expect(res.status).toBe(401);
    expect((await sync("hc_not_a_real_key_at_all_xxxxxxxxxxxxxxx")).res.status).toBe(401);
  });

  it("rejects a valid key that isn't a device's with 403", async () => {
    const { bob } = await seedFamily();
    const created = (await (
      await req("/api/auth/api-key/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: bob.cookie,
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ name: "bob-script" }),
      })
    ).json()) as { key: string };
    const { res } = await sync(created.key);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("NOT_A_DEVICE");
  });

  it("rejects a display's key with 403 — only speakers sync", async () => {
    const { admin } = await seedFamily();
    const { key } = await createDevice(admin.cookie, { kind: "display", name: "Kindle" });
    const { res } = await sync(key as string);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("NOT_A_SPEAKER");
  });

  it("rejects a malformed report with 400", async () => {
    const { key } = await speaker();
    for (const bad of [{}, report({ schemaVersion: 2 }), report({ agentVersion: "latest" })]) {
      expect((await sync(key, bad)).res.status).toBe(400);
    }
  });
});

describe("POST /agent/sync — desired state", () => {
  it("returns settings, the release, sounds and a 60 s cadence, and stores the report", async () => {
    const { admin, device, key } = await speaker({ volumes: { alarm: 12, music: 6 } });
    const { res, json } = await sync(key);
    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      schemaVersion: 1,
      deviceId: device.id,
      nextPollAfterMs: 60_000,
      settings: { language: "en", volumes: { alarm: 12, music: 6 }, quietWindows: [] },
      schedule: [],
      announcements: [],
    });

    const release = readFileSync(path.join(AGENT_DIR, "releases/agent-1.0.0.py"));
    expect(json?.agent).toEqual({
      version: "1.0.0",
      url: "/api/v1/agent/releases/1.0.0",
      sha256: createHash("sha256").update(release).digest("hex"),
    });
    expect(json?.sounds.map((s) => s.name).sort()).toEqual(["beeps", "chime"]);

    const view = (await (
      await asUser(admin.cookie, `/api/v1/admin/devices/${device.id}`)
    ).json()) as DeviceViewJson;
    expect(view.status).toBe("online");
    expect(view.lastStatus).toMatchObject({ battery: 87, wifiRssi: -71, agentVersion: "1.0.0" });
  });

  it("serves the release and sounds byte-for-byte to the device only", async () => {
    const { key } = await speaker();
    const { json } = await sync(key);
    for (const file of [json?.agent, ...(json?.sounds ?? [])]) {
      if (!file) continue;
      const res = await asKey(key, file.url);
      expect(res.status).toBe(200);
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
      expect((await req(file.url)).status).toBe(401);
    }
    expect((await asKey(key, "/api/v1/agent/releases/9.9.9")).status).toBe(404);
    expect((await asKey(key, "/api/v1/agent/sounds/../../etc")).status).toBe(404);
  });

  it("follows a pinned version and refuses to pin one that isn't bundled", async () => {
    const { admin, device, key } = await speaker();
    const pinUrl = `/api/v1/admin/devices/${device.id}`;
    const bad = await asUser(admin.cookie, pinUrl, "PATCH", {
      settings: { agentVersion: "9.9.9" },
    });
    expect(bad.status).toBe(400);
    const ok = await asUser(admin.cookie, pinUrl, "PATCH", { settings: { agentVersion: "1.0.0" } });
    expect(ok.status).toBe(200);
    expect((await sync(key)).json?.agent?.version).toBe("1.0.0");
  });

  it("lists concrete quiet windows when quiet hours are on", async () => {
    const { key } = await speaker({ quietHours: quietAroundNow() });
    const { json } = await sync(key);
    const now = Date.now();
    expect(
      json?.settings.quietWindows.some(
        (w) => Date.parse(w.start) <= now && now < Date.parse(w.end),
      ),
    ).toBe(true);
  });

  it("acknowledges every rang id it receives, known or not", async () => {
    const { key } = await speaker();
    const { json } = await sync(
      key,
      report({ rang: [{ id: "update:1.0.0", at: new Date().toISOString(), ok: true }] }),
    );
    expect(json?.ack).toEqual(["update:1.0.0"]);
  });
});

describe("Say now", () => {
  it("delivers an announcement, speeds up polling, and clears it once played", async () => {
    const { admin, device, key } = await speaker();
    const announce = await asUser(
      admin.cookie,
      `/api/v1/admin/devices/${device.id}/announce`,
      "POST",
      {
        text: "Dinner is ready",
      },
    );
    expect(announce.status).toBe(201);
    const { id } = (await announce.json()) as { id: string };

    const first = (await sync(key)).json;
    expect(first?.nextPollAfterMs).toBe(5_000);
    expect(first?.announcements).toEqual([
      expect.objectContaining({
        id: `announcement:${id}`,
        text: "Dinner is ready",
        sound: "chime",
      }),
    ]);

    const played = (
      await sync(
        key,
        report({ rang: [{ id: `announcement:${id}`, at: new Date().toISOString(), ok: true }] }),
      )
    ).json;
    expect(played?.ack).toEqual([`announcement:${id}`]);
    expect(played?.announcements).toEqual([]);
    const [row] = await ctx.db
      .select()
      .from(schema.deviceAnnouncements)
      .where(eq(schema.deviceAnnouncements.id, id));
    expect(row.playOk).toBe(true);
    expect(row.playedAt).not.toBeNull();
  });

  it("never delivers an expired announcement", async () => {
    const { admin, device, key } = await speaker();
    const res = await asUser(admin.cookie, `/api/v1/admin/devices/${device.id}/announce`, "POST", {
      text: "Too late",
    });
    const { id } = (await res.json()) as { id: string };
    await ctx.db
      .update(schema.deviceAnnouncements)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.deviceAnnouncements.id, id));
    expect((await sync(key)).json?.announcements).toEqual([]);
  });

  it("is refused during quiet hours with a clear code", async () => {
    const { admin, device } = await speaker({ quietHours: quietAroundNow() });
    const res = await asUser(admin.cookie, `/api/v1/admin/devices/${device.id}/announce`, "POST", {
      text: "Hello",
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("QUIET_HOURS");
    expect(body.error).toContain("quiet hours until");
    expect(await ctx.db.select().from(schema.deviceAnnouncements)).toHaveLength(0);
  });

  it("validates input, is admin-only, and only works on speakers", async () => {
    const { admin, bob, device } = await speaker();
    const url = `/api/v1/admin/devices/${device.id}/announce`;
    expect((await asUser(admin.cookie, url, "POST", { text: "" })).status).toBe(400);
    expect((await asUser(admin.cookie, url, "POST", { text: "x", sound: "trumpet" })).status).toBe(
      400,
    );
    expect((await asUser(bob.cookie, url, "POST", { text: "hi" })).status).toBe(403);
    const { device: kindle } = await createDevice(admin.cookie, {
      kind: "display",
      name: "Kindle",
    });
    expect(
      (
        await asUser(admin.cookie, `/api/v1/admin/devices/${kindle.id}/announce`, "POST", {
          text: "hi",
        })
      ).status,
    ).toBe(400);
  });

  it("polls every 15 s while an admin has the speaker open", async () => {
    const { admin, device, key } = await speaker();
    const res = await asUser(admin.cookie, `/api/v1/admin/devices/${device.id}/attention`, "POST");
    expect(res.status).toBe(200);
    expect((await sync(key)).json?.nextPollAfterMs).toBe(15_000);
  });
});
