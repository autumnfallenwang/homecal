import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.js";
import { createAnnounceRateLimiter } from "../../src/middleware/rate-limit.js";
import { checkDueReminders } from "../../src/services/reminder-scheduler.js";
import { asKey, asUser, createDevice, ctx, req, seedFamily, useHouseholdDb } from "./helpers.js";

useHouseholdDb();

interface ScheduleItem {
  id: string;
  kind: string;
  at: string;
  sound: string;
  text: string;
}

async function setup() {
  const family = await seedFamily();
  const kids = await createDevice(family.admin.cookie, {
    kind: "speaker",
    name: "Kids' room",
    memberIds: [family.carol.id],
  });
  const kitchen = await createDevice(family.admin.cookie, {
    kind: "speaker",
    name: "Kitchen",
    memberIds: [family.bob.id],
  });
  return {
    ...family,
    kids: { ...kids.device, key: kids.key as string },
    kitchen: { ...kitchen.device, key: kitchen.key as string },
  };
}

async function createEvent(
  cookie: string,
  opts: { title: string; startsInMin: number; assigneeIds: string[]; private?: boolean },
) {
  const start = new Date(Date.now() + opts.startsInMin * 60_000);
  const res = await asUser(cookie, "/api/v1/events", "POST", {
    title: opts.title,
    start: start.toISOString(),
    end: new Date(start.getTime() + 3_600_000).toISOString(),
    assigneeIds: opts.assigneeIds,
    private: opts.private ?? false,
  });
  if (res.status !== 201) throw new Error(`event ${res.status}: ${await res.text()}`);
  return { ...((await res.json()) as { id: string }), start };
}

function addReminder(cookie: string, eventId: string, body: Record<string, unknown>) {
  return asUser(cookie, `/api/v1/events/${eventId}/reminders`, "POST", body);
}

async function schedule(key: string): Promise<ScheduleItem[]> {
  const res = await asKey(key, "/api/v1/agent/sync", "POST", {
    schemaVersion: 1,
    agentVersion: "1.0.0",
  });
  return ((await res.json()) as { schedule: ScheduleItem[] }).schedule.filter(
    (i) => i.kind === "reminder",
  );
}

function setDelivery(cookie: string, userId: string, reminderDelivery: string[]) {
  return asUser(cookie, `/api/v1/admin/users/${userId}/reminder-delivery`, "PATCH", {
    reminderDelivery,
  });
}

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
    end: fmt(new Date(Date.now() + 3 * 60 * 60_000)),
    days: [0, 1, 2, 3, 4, 5, 6],
  };
}

describe("per-event speaker reminders", () => {
  it("plays on the speakers serving the assignees, at the reminder time", async () => {
    const { admin, carol, kids, kitchen } = await setup();
    const ev = await createEvent(admin.cookie, {
      title: "Soccer practice",
      startsInMin: 90,
      assigneeIds: [carol.id],
    });
    const res = await addReminder(admin.cookie, ev.id, { minutesBefore: 15, channel: "speaker" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { deviceIds: string[] }).deviceIds).toEqual([]);

    const items = await schedule(kids.key);
    expect(items).toEqual([
      {
        id: `reminder:${ev.id}:15`,
        kind: "reminder",
        at: new Date(ev.start.getTime() - 15 * 60_000).toISOString(),
        sound: "chime",
        text: "Soccer practice starts in 15 minutes.",
      },
    ]);
    expect(await schedule(kitchen.key)).toEqual([]);
  });

  it("plays only on the speakers picked for it, when some are picked", async () => {
    const { admin, carol, kids, kitchen } = await setup();
    const ev = await createEvent(admin.cookie, {
      title: "Pick up the kids",
      startsInMin: 60,
      assigneeIds: [carol.id],
    });
    const res = await addReminder(admin.cookie, ev.id, {
      minutesBefore: 10,
      channel: "speaker",
      deviceIds: [kitchen.id],
    });
    expect(((await res.json()) as { deviceIds: string[] }).deviceIds).toEqual([kitchen.id]);
    expect((await schedule(kitchen.key)).map((i) => i.id)).toEqual([`reminder:${ev.id}:10`]);
    expect(await schedule(kids.key)).toEqual([]);

    const listed = (await (
      await asUser(admin.cookie, `/api/v1/events/${ev.id}/reminders`)
    ).json()) as { channel: string; deviceIds: string[] }[];
    expect(listed[0]).toMatchObject({ channel: "speaker", deviceIds: [kitchen.id] });
  });

  it("supports 'At start' and rejects unknown speakers", async () => {
    const { admin, carol, kids } = await setup();
    const ev = await createEvent(admin.cookie, {
      title: "Time to leave for school",
      startsInMin: 30,
      assigneeIds: [carol.id],
    });
    expect(
      (await addReminder(admin.cookie, ev.id, { minutesBefore: 0, channel: "speaker" })).status,
    ).toBe(201);
    expect((await schedule(kids.key))[0].text).toBe("Time to leave for school is starting now.");

    const { device: kindle } = await createDevice(admin.cookie, {
      kind: "display",
      name: "Kindle",
    });
    for (const deviceIds of [["5b0f1a30-0d53-4c50-9a76-2b3c3b5f3a11"], [kindle.id]]) {
      const res = await addReminder(admin.cookie, ev.id, {
        minutesBefore: 5,
        channel: "speaker",
        deviceIds,
      });
      expect(res.status).toBe(400);
    }
  });

  it("never reads a private event aloud", async () => {
    const { admin, carol, kids } = await setup();
    const ev = await createEvent(admin.cookie, {
      title: "Secret party",
      startsInMin: 60,
      assigneeIds: [carol.id],
      private: true,
    });
    await addReminder(admin.cookie, ev.id, { minutesBefore: 15, channel: "speaker" });
    expect(await schedule(kids.key)).toEqual([]);
  });

  it("rings through quiet hours, because someone chose that time", async () => {
    const { admin, carol, kids } = await setup();
    await asUser(admin.cookie, `/api/v1/admin/devices/${kids.id}`, "PATCH", {
      settings: { quietHours: quietAroundNow() },
    });
    const ev = await createEvent(admin.cookie, {
      title: "Medicine",
      startsInMin: 40,
      assigneeIds: [carol.id],
    });
    await addReminder(admin.cookie, ev.id, { minutesBefore: 0, channel: "speaker" });
    expect(await schedule(kids.key)).toHaveLength(1);
  });

  it("is stamped sent when the speaker reports it rang, not by the email scheduler", async () => {
    const { admin, carol, kids } = await setup();
    const ev = await createEvent(admin.cookie, {
      title: "Soccer practice",
      startsInMin: 5,
      assigneeIds: [carol.id],
    });
    await addReminder(admin.cookie, ev.id, { minutesBefore: 15, channel: "speaker" });
    const sent = { email: 0 };
    await checkDueReminders({
      emailFn: () => {
        sent.email++;
        return Promise.resolve({ success: true });
      },
    });
    const [row] = await ctx.db
      .select()
      .from(schema.eventReminders)
      .where(eq(schema.eventReminders.eventId, ev.id));
    expect(row.sentAt).toBeNull();
    expect(sent.email).toBe(0);

    await asKey(kids.key, "/api/v1/agent/sync", "POST", {
      schemaVersion: 1,
      agentVersion: "1.0.0",
      rang: [{ id: `reminder:${ev.id}:15`, at: new Date().toISOString(), ok: true }],
    });
    const [after] = await ctx.db
      .select()
      .from(schema.eventReminders)
      .where(eq(schema.eventReminders.eventId, ev.id));
    expect(after.sentAt).not.toBeNull();
  });

  it("retires a speaker reminder nobody played half an hour after it was due", async () => {
    const { admin, carol } = await setup();
    const ev = await createEvent(admin.cookie, {
      title: "Soccer practice",
      startsInMin: -20,
      assigneeIds: [carol.id],
    });
    await addReminder(admin.cookie, ev.id, { minutesBefore: 15, channel: "speaker" });
    await checkDueReminders({ emailFn: () => Promise.resolve({ success: true }) });
    const [row] = await ctx.db
      .select()
      .from(schema.eventReminders)
      .where(eq(schema.eventReminders.eventId, ev.id));
    expect(row.sentAt).not.toBeNull();
  });
});

describe("per-member reminder delivery", () => {
  it("plays every reminder of a speaker member's events, once, and skips their email", async () => {
    const { admin, carol, kids } = await setup();
    expect((await setDelivery(admin.cookie, carol.id, ["speaker"])).status).toBe(200);

    // Due in 30 minutes: on the speaker, once, though it has an email and a push row.
    const upcoming = await createEvent(admin.cookie, {
      title: "Dentist",
      startsInMin: 90,
      assigneeIds: [carol.id],
    });
    await addReminder(admin.cookie, upcoming.id, { minutesBefore: 60, channel: "email" });
    await addReminder(admin.cookie, upcoming.id, { minutesBefore: 60, channel: "push" });
    const items = await schedule(kids.key);
    expect(items.map((i) => i.id)).toEqual([`reminder:${upcoming.id}:60`]);
    expect(items[0].text).toBe("Dentist starts in 1 hour.");

    // Due now: the email scheduler leaves Carol out and retires the row.
    const due = await createEvent(admin.cookie, {
      title: "Piano",
      startsInMin: 30,
      assigneeIds: [carol.id],
    });
    await addReminder(admin.cookie, due.id, { minutesBefore: 60, channel: "email" });
    const emailed: string[] = [];
    await checkDueReminders({
      emailFn: (_c, to) => {
        emailed.push(to);
        return Promise.resolve({ success: true });
      },
    });
    expect(emailed).toEqual([]);
    const [row] = await ctx.db
      .select()
      .from(schema.eventReminders)
      .where(eq(schema.eventReminders.eventId, due.id));
    expect(row.sentAt).not.toBeNull();
  });

  it("keeps today's behaviour for members left at the default", async () => {
    const { admin, bob } = await setup();
    const ev = await createEvent(admin.cookie, {
      title: "Dentist",
      startsInMin: 30,
      assigneeIds: [bob.id],
    });
    await addReminder(admin.cookie, ev.id, { minutesBefore: 60, channel: "email" });
    const emailed: string[] = [];
    await checkDueReminders({
      emailFn: (_c, to) => {
        emailed.push(to);
        return Promise.resolve({ success: true });
      },
    });
    expect(emailed).toEqual(["bob@example.com"]);
  });

  it("respects quiet hours for automatic reminders", async () => {
    const { admin, carol, kids } = await setup();
    await setDelivery(admin.cookie, carol.id, ["speaker"]);
    await asUser(admin.cookie, `/api/v1/admin/devices/${kids.id}`, "PATCH", {
      settings: { quietHours: quietAroundNow() },
    });
    const ev = await createEvent(admin.cookie, {
      title: "Dentist",
      startsInMin: 90,
      assigneeIds: [carol.id],
    });
    await addReminder(admin.cookie, ev.id, { minutesBefore: 15, channel: "email" });
    expect(await schedule(kids.key)).toEqual([]);
  });

  it("is admin-only and validated", async () => {
    const { admin, bob, carol } = await setup();
    expect((await setDelivery(bob.cookie, carol.id, ["speaker"])).status).toBe(403);
    expect((await setDelivery(admin.cookie, carol.id, ["pigeon"])).status).toBe(400);
    expect(
      (await setDelivery(admin.cookie, "5b0f1a30-0d53-4c50-9a76-2b3c3b5f3a11", ["email"])).status,
    ).toBe(404);
    const all = (await (await asUser(admin.cookie, "/api/v1/admin/reminder-delivery")).json()) as {
      userId: string;
      reminderDelivery: string[];
    }[];
    expect(all.find((r) => r.userId === carol.id)?.reminderDelivery).toEqual(["email", "push"]);
  });
});

describe("GET /speaker/speakers", () => {
  it("lists speakers by name for any member, and nothing for anonymous callers", async () => {
    const { bob } = await setup();
    const res = await asUser(bob.cookie, "/api/v1/speaker/speakers");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { name: string; room: string | null }[];
    expect(rows.map((r) => r.name)).toEqual(["Kids' room", "Kitchen"]);
    expect(Object.keys(rows[0]).sort()).toEqual(["id", "name", "room"]);
    expect((await req("/api/v1/speaker/speakers")).status).toBe(401);
  });
});

describe("POST /speaker/announce", () => {
  async function serviceKey(adminCookie: string) {
    const svc = (await (
      await asUser(adminCookie, "/api/v1/admin/service-accounts", "POST", { name: "homework" })
    ).json()) as { id: string };
    const key = (await (
      await asUser(adminCookie, "/api/v1/admin/api-keys", "POST", {
        name: "homework",
        userId: svc.id,
      })
    ).json()) as { key: string };
    return key.key;
  }

  it("lets another home app announce to the speakers serving a member", async () => {
    const { admin, carol, kids } = await setup();
    const key = await serviceKey(admin.cookie);
    const res = await asKey(key, "/api/v1/speaker/announce", "POST", {
      text: "Time to do homework",
      memberIds: [carol.id],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { queued: { deviceId: string }[]; quiet: string[] };
    expect(body.queued.map((q) => q.deviceId)).toEqual([kids.id]);

    const desired = (await (
      await asKey(kids.key, "/api/v1/agent/sync", "POST", {
        schemaVersion: 1,
        agentVersion: "1.0.0",
      })
    ).json()) as { announcements: { text: string }[] };
    expect(desired.announcements.map((a) => a.text)).toEqual(["Time to do homework"]);
  });

  it("is for admins and service accounts, not ordinary members", async () => {
    const { bob, carol } = await setup();
    const res = await asUser(bob.cookie, "/api/v1/speaker/announce", "POST", {
      text: "hi",
      memberIds: [carol.id],
    });
    expect(res.status).toBe(403);
    expect((await req("/api/v1/speaker/announce", { method: "POST" })).status).toBe(401);
  });

  it("validates targets and reports when nothing can play", async () => {
    const { admin, kids } = await setup();
    const dave = (await (
      await req("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Dave",
          email: "dave@example.com",
          password: "password123",
          color: "#000000",
        }),
      })
    ).json()) as { user: { id: string } };
    const url = "/api/v1/speaker/announce";
    expect((await asUser(admin.cookie, url, "POST", { text: "hi" })).status).toBe(400);
    expect(
      (
        await asUser(admin.cookie, url, "POST", {
          text: "hi",
          deviceIds: ["5b0f1a30-0d53-4c50-9a76-2b3c3b5f3a11"],
        })
      ).status,
    ).toBe(400);
    const none = await asUser(admin.cookie, url, "POST", { text: "hi", memberIds: [dave.user.id] });
    expect(none.status).toBe(409);
    expect(((await none.json()) as { code: string }).code).toBe("NO_SPEAKER");

    await asUser(admin.cookie, `/api/v1/admin/devices/${kids.id}`, "PATCH", {
      settings: { quietHours: quietAroundNow() },
    });
    const quiet = await asUser(admin.cookie, url, "POST", { text: "hi", deviceIds: [kids.id] });
    expect(quiet.status).toBe(409);
    expect(((await quiet.json()) as { code: string }).code).toBe("QUIET_HOURS");
  });

  it("has its own low per-caller rate limit", async () => {
    const mini = new Hono();
    mini.post("/announce", createAnnounceRateLimiter(2), (c) => c.json({ ok: true }));
    const hit = () =>
      mini.request("/announce", { method: "POST", headers: { "x-api-key": "hc_same_caller" } });
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    const third = await hit();
    expect(third.status).toBe(429);
    expect(((await third.json()) as { code: string }).code).toBe("RATE_LIMITED");
  });
});
