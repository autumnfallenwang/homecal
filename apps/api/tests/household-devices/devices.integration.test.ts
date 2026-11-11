import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.js";
import { checkDeviceHealth } from "../../src/services/device-health.js";
import {
  asUser,
  createDevice,
  createUser,
  ctx,
  type DeviceViewJson,
  req,
  seedFamily,
  useHouseholdDb,
} from "./helpers.js";

useHouseholdDb();

const DEVICES = "/api/v1/admin/devices";

async function setLastSeen(deviceId: string, minutesAgo: number | null) {
  await ctx.db
    .update(schema.householdDevices)
    .set({ lastSeenAt: minutesAgo === null ? null : new Date(Date.now() - minutesAgo * 60_000) })
    .where(eq(schema.householdDevices.id, deviceId));
}

async function deviceRow(id: string) {
  const [row] = await ctx.db
    .select()
    .from(schema.householdDevices)
    .where(eq(schema.householdDevices.id, id));
  return row;
}

function emailSpy() {
  const sent: { to: string; subject: string; body: string }[] = [];
  return {
    sent,
    emailFn: (_c: unknown, to: string, subject: string, body: string) => {
      sent.push({ to, subject, body });
      return Promise.resolve({ success: true });
    },
  };
}

describe("admin devices — auth boundary", () => {
  it("returns 401 without a session", async () => {
    expect((await req(DEVICES)).status).toBe(401);
    const res = await req(DEVICES, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "speaker", name: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin member", async () => {
    const { bob } = await seedFamily();
    expect((await asUser(bob.cookie, DEVICES)).status).toBe(403);
    const res = await asUser(bob.cookie, DEVICES, "POST", { kind: "speaker", name: "x" });
    expect(res.status).toBe(403);
    expect(await ctx.db.select().from(schema.householdDevices)).toHaveLength(0);
  });
});

describe("POST /admin/devices", () => {
  it("registers a speaker, mints its key once, and records the members it serves", async () => {
    const { admin, carol } = await seedFamily();
    const { device, key } = await createDevice(admin.cookie, {
      kind: "speaker",
      name: "Kids' room speaker",
      room: "Kids' room",
      memberIds: [carol.id],
    });
    expect(key).toMatch(/^hc_/);
    expect(device).toMatchObject({
      kind: "speaker",
      name: "Kids' room speaker",
      room: "Kids' room",
      memberIds: [carol.id],
      offlineAfterMinutes: 5,
      status: "never",
      key: { ownedByDevices: true },
    });
    expect(device.settings).toMatchObject({ language: "en", volumes: { alarm: 10, music: 8 } });

    // The plaintext key is never shown again.
    const list = (await (await asUser(admin.cookie, DEVICES)).json()) as {
      devices: DeviceViewJson[];
    };
    expect(JSON.stringify(list)).not.toContain(key as string);
  });

  it("defaults a display to a 30-minute offline threshold", async () => {
    const { admin } = await seedFamily();
    const { device } = await createDevice(admin.cookie, {
      kind: "display",
      name: "Kitchen Kindle",
    });
    expect(device.offlineAfterMinutes).toBe(30);
  });

  it("rejects bad input with 400 and writes nothing", async () => {
    const { admin } = await seedFamily();
    const cases = [
      { kind: "toaster", name: "x" },
      { kind: "speaker", name: "" },
      { kind: "speaker", name: "x", settings: { volumes: { alarm: 99 } } },
      { kind: "speaker", name: "x", memberIds: ["5b0f1a30-0d53-4c50-9a76-2b3c3b5f3a11"] },
      { kind: "speaker", name: "x", offlineAfterMinutes: 0 },
    ];
    for (const body of cases) {
      const res = await asUser(admin.cookie, DEVICES, "POST", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await ctx.db.select().from(schema.householdDevices)).toHaveLength(0);
  });

  it("adopts an existing service-account key (the Kindle) without minting a new one", async () => {
    const { admin } = await seedFamily();
    const svc = (await (
      await asUser(admin.cookie, "/api/v1/admin/service-accounts", "POST", { name: "Kindle" })
    ).json()) as { id: string };
    const minted = (await (
      await asUser(admin.cookie, "/api/v1/admin/api-keys", "POST", {
        name: "kindle",
        userId: svc.id,
      })
    ).json()) as { id: string; key: string };

    const adoptable = (await (await asUser(admin.cookie, `${DEVICES}/adoptable-keys`)).json()) as {
      id: string;
    }[];
    expect(adoptable.map((k) => k.id)).toContain(minted.id);

    const { device, key } = await createDevice(admin.cookie, {
      kind: "display",
      name: "Kitchen Kindle",
      adoptApiKeyId: minted.id,
    });
    expect(key).toBeNull();
    expect(device.key).toMatchObject({ id: minted.id, ownedByDevices: false });

    const again = await asUser(admin.cookie, DEVICES, "POST", {
      kind: "display",
      name: "Twin",
      adoptApiKeyId: minted.id,
    });
    expect(again.status).toBe(409);
  });

  it("keeps the Home devices account out of the Services list", async () => {
    const { admin } = await seedFamily();
    await createDevice(admin.cookie, { kind: "speaker", name: "Kids' room" });
    const services = (await (
      await asUser(admin.cookie, "/api/v1/admin/service-accounts")
    ).json()) as { user: { name: string } }[];
    expect(services.map((s) => s.user.name)).not.toContain("Home devices");
  });
});

describe("PATCH /admin/devices/:id", () => {
  it("merges settings, replaces members, and re-validates against the device's kind", async () => {
    const { admin, bob, carol } = await seedFamily();
    const { device } = await createDevice(admin.cookie, {
      kind: "speaker",
      name: "Kids' room",
      memberIds: [carol.id],
    });

    const res = await asUser(admin.cookie, `${DEVICES}/${device.id}`, "PATCH", {
      memberIds: [bob.id, carol.id],
      settings: { volumes: { alarm: 13 }, quietHours: { enabled: true } },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as DeviceViewJson;
    expect(new Set(view.memberIds)).toEqual(new Set([bob.id, carol.id]));
    expect(view.settings).toMatchObject({
      volumes: { alarm: 13, music: 8 },
      quietHours: { enabled: true, start: "21:00", end: "07:00" },
    });

    const bad = await asUser(admin.cookie, `${DEVICES}/${device.id}`, "PATCH", {
      settings: { language: "klingon" },
    });
    expect(bad.status).toBe(400);
  });

  it("returns 404 for an unknown or malformed id", async () => {
    const { admin } = await seedFamily();
    const unknown = "5b0f1a30-0d53-4c50-9a76-2b3c3b5f3a11";
    expect((await asUser(admin.cookie, `${DEVICES}/${unknown}`)).status).toBe(404);
    expect((await asUser(admin.cookie, `${DEVICES}/not-a-uuid`)).status).toBe(404);
    expect(
      (await asUser(admin.cookie, `${DEVICES}/not-a-uuid`, "PATCH", { name: "x" })).status,
    ).toBe(404);
  });
});

describe("display check-ins via /dash", () => {
  it("records a check-in and applies the display's stored refresh and members", async () => {
    const { admin, bob, carol } = await seedFamily();
    const { device, key } = await createDevice(admin.cookie, {
      kind: "display",
      name: "Kids' Kindle",
      memberIds: [carol.id],
      settings: { refreshSeconds: 300 },
    });
    const now = new Date();
    const start = new Date(now.getTime() + 60_000).toISOString();
    const end = new Date(now.getTime() + 3_600_000).toISOString();
    await asUser(admin.cookie, "/api/v1/events", "POST", {
      title: "Soccer practice",
      start,
      end,
      assigneeIds: [carol.id],
    });
    await asUser(admin.cookie, "/api/v1/events", "POST", {
      title: "Dentist",
      start,
      end,
      assigneeIds: [bob.id],
    });

    const res = await req(`/api/v1/dash?key=${key}&tz=UTC`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('content="300"');
    expect(html).toContain("Soccer practice");
    expect(html).not.toContain("Dentist");
    expect((await deviceRow(device.id)).lastSeenAt).not.toBeNull();

    // A URL parameter still wins over the stored setting.
    const override = await (await req(`/api/v1/dash?key=${key}&tz=UTC&refresh=60`)).text();
    expect(override).toContain('content="60"');
  });
});

describe("device keys", () => {
  it("rotating stops the old key immediately and the new one works", async () => {
    const { admin } = await seedFamily();
    const { device, key: oldKey } = await createDevice(admin.cookie, {
      kind: "display",
      name: "Kitchen Kindle",
    });
    const rotated = (await (
      await asUser(admin.cookie, `${DEVICES}/${device.id}/rotate-key`, "POST")
    ).json()) as { key: string };
    expect(rotated.key).toMatch(/^hc_/);
    expect(rotated.key).not.toBe(oldKey);
    expect((await req(`/api/v1/dash?key=${oldKey}`)).status).toBe(401);
    expect((await req(`/api/v1/dash?key=${rotated.key}`)).status).toBe(200);
  });

  it("revoking keeps the device but its key stops working", async () => {
    const { admin } = await seedFamily();
    const { device, key } = await createDevice(admin.cookie, { kind: "display", name: "Kindle" });
    const res = await asUser(admin.cookie, `${DEVICES}/${device.id}/key`, "DELETE");
    expect(((await res.json()) as DeviceViewJson).key).toBeNull();
    expect((await req(`/api/v1/dash?key=${key}`)).status).toBe(401);
  });

  it("deleting a device revokes its key", async () => {
    const { admin } = await seedFamily();
    const { device, key } = await createDevice(admin.cookie, { kind: "display", name: "Kindle" });
    expect((await asUser(admin.cookie, `${DEVICES}/${device.id}`, "DELETE")).status).toBe(200);
    expect(await ctx.db.select().from(schema.householdDevices)).toHaveLength(0);
    expect((await req(`/api/v1/dash?key=${key}`)).status).toBe(401);
  });

  it("a family member's own key is not a device key", async () => {
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
    // /dash still accepts it (Phase 22 behaviour) but records no device check-in.
    expect((await req(`/api/v1/dash?key=${created.key}`)).status).toBe(200);
    expect(await ctx.db.select().from(schema.householdDevices)).toHaveLength(0);
  });
});

describe("alert recipients", () => {
  it("starts with the first admin only, and can be set", async () => {
    const { admin, bob } = await seedFamily();
    const initial = (await (await asUser(admin.cookie, DEVICES)).json()) as {
      alertRecipientIds: string[];
    };
    expect(initial.alertRecipientIds).toEqual([admin.id]);

    const res = await asUser(admin.cookie, `${DEVICES}/alerts`, "PATCH", {
      recipientIds: [admin.id, bob.id],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alertRecipientIds: string[] };
    expect(new Set(body.alertRecipientIds)).toEqual(new Set([admin.id, bob.id]));
  });

  it("rejects malformed and unknown recipient ids", async () => {
    const { admin } = await seedFamily();
    expect(
      (await asUser(admin.cookie, `${DEVICES}/alerts`, "PATCH", { recipientIds: ["nope"] })).status,
    ).toBe(400);
    expect(
      (
        await asUser(admin.cookie, `${DEVICES}/alerts`, "PATCH", {
          recipientIds: ["5b0f1a30-0d53-4c50-9a76-2b3c3b5f3a11"],
        })
      ).status,
    ).toBe(400);
  });
});

describe("checkDeviceHealth", () => {
  async function setup() {
    const { admin } = await seedFamily();
    await asUser(admin.cookie, `${DEVICES}/alerts`, "PATCH", { recipientIds: [admin.id] });
    const { device } = await createDevice(admin.cookie, { kind: "speaker", name: "Kids' room" });
    return { admin, device };
  }

  it("emails once when a device goes offline, and once when it comes back", async () => {
    const { device } = await setup();
    const spy = emailSpy();

    await setLastSeen(device.id, 10);
    expect(await checkDeviceHealth({ emailFn: spy.emailFn })).toBe(1);
    expect(spy.sent).toHaveLength(1);
    expect(spy.sent[0]).toMatchObject({
      to: "alice@example.com",
      subject: "HomeCal: Kids' room is offline",
    });
    expect((await deviceRow(device.id)).offlineAlertedAt).not.toBeNull();

    // Still offline on the next tick: no repeat.
    expect(await checkDeviceHealth({ emailFn: spy.emailFn })).toBe(0);
    expect(spy.sent).toHaveLength(1);

    await setLastSeen(device.id, 0);
    expect(await checkDeviceHealth({ emailFn: spy.emailFn })).toBe(1);
    expect(spy.sent[1].subject).toBe("HomeCal: Kids' room is back online");
    expect((await deviceRow(device.id)).offlineAlertedAt).toBeNull();
  });

  it("catches a device that was already offline before a restart", async () => {
    // Nothing in memory: the state that matters is lastSeenAt + offlineAlertedAt in
    // the database, so the first tick after a restart still alerts.
    const { device } = await setup();
    await setLastSeen(device.id, 60 * 24);
    const spy = emailSpy();
    expect(await checkDeviceHealth({ emailFn: spy.emailFn })).toBe(1);
  });

  it("stays quiet for a device that has never checked in or is only stale", async () => {
    const { device } = await setup();
    const spy = emailSpy();
    expect(await checkDeviceHealth({ emailFn: spy.emailFn })).toBe(0);
    await setLastSeen(device.id, 3);
    expect(await checkDeviceHealth({ emailFn: spy.emailFn })).toBe(0);
    expect(spy.sent).toHaveLength(0);
  });

  it("records the outage without emailing when alerts are off for the device", async () => {
    const { admin, device } = await setup();
    await asUser(admin.cookie, `${DEVICES}/${device.id}`, "PATCH", { alertsEnabled: false });
    await setLastSeen(device.id, 10);
    const spy = emailSpy();
    expect(await checkDeviceHealth({ emailFn: spy.emailFn })).toBe(0);
    expect(spy.sent).toHaveLength(0);
    expect((await deviceRow(device.id)).offlineAlertedAt).not.toBeNull();
  });

  it("never emails service accounts or members who opted out", async () => {
    const { admin, device } = await setup();
    await createUser("Dave", "dave@example.com");
    await asUser(admin.cookie, `${DEVICES}/alerts`, "PATCH", { recipientIds: [] });
    await setLastSeen(device.id, 10);
    const spy = emailSpy();
    await checkDeviceHealth({ emailFn: spy.emailFn });
    expect(spy.sent).toHaveLength(0);
  });
});
