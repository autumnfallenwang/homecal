import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.js";
import { checkRoutineAlerts } from "../../src/services/routines.js";
import { asKey, asUser, createDevice, ctx, req, seedFamily, useHouseholdDb } from "./helpers.js";

useHouseholdDb();

const ROUTINES = "/api/v1/admin/routines";
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const TZ = "America/New_York";

interface RoutineJson {
  id: string;
  memberId: string;
  title: string;
  weekDays: number[];
  skips: string[];
  next: { date: string; at: string } | null;
  last: { date: string; ok: boolean | null; error: string | null } | null;
  speakers: { id: string; name: string }[];
}
interface ScheduleItem {
  id: string;
  kind: string;
  at: string;
  sound: string;
  text: string;
}

/** Local HH:MM in the household zone, `minutes` from now. */
function localTimeIn(minutes: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(Date.now() + minutes * 60_000));
}

async function setup() {
  const family = await seedFamily();
  const { device, key } = await createDevice(family.admin.cookie, {
    kind: "speaker",
    name: "Kids' room",
    memberIds: [family.carol.id],
  });
  return { ...family, speaker: device, key: key as string };
}

async function createRoutine(cookie: string, body: Record<string, unknown>) {
  const res = await asUser(cookie, ROUTINES, "POST", body);
  if (res.status !== 201) throw new Error(`create routine ${res.status}: ${await res.text()}`);
  return (await res.json()) as RoutineJson;
}

async function schedule(key: string): Promise<ScheduleItem[]> {
  const res = await asKey(key, "/api/v1/agent/sync", "POST", {
    schemaVersion: 1,
    agentVersion: "1.0.0",
  });
  return ((await res.json()) as { schedule: ScheduleItem[] }).schedule;
}

function spy() {
  const sent: { subject: string; body: string }[] = [];
  return {
    sent,
    emailFn: (_c: unknown, _to: string, subject: string, body: string) => {
      sent.push({ subject, body });
      return Promise.resolve({ success: true });
    },
  };
}

describe("admin routines — auth and validation", () => {
  it("is admin-only", async () => {
    const { bob, carol } = await setup();
    expect((await req(ROUTINES)).status).toBe(401);
    expect((await asUser(bob.cookie, ROUTINES)).status).toBe(403);
    const res = await asUser(bob.cookie, ROUTINES, "POST", {
      memberId: carol.id,
      title: "Wake up",
      time: "06:45",
      weekDays: [1],
    });
    expect(res.status).toBe(403);
  });

  it("rejects bad input and unknown members with 400, writing nothing", async () => {
    const { admin, carol } = await setup();
    const good = { memberId: carol.id, title: "Wake up", time: "06:45", weekDays: [1, 2, 3] };
    for (const bad of [
      { ...good, time: "7am" },
      { ...good, weekDays: [] },
      { ...good, title: "" },
      { ...good, memberId: "5b0f1a30-0d53-4c50-9a76-2b3c3b5f3a11" },
    ]) {
      expect((await asUser(admin.cookie, ROUTINES, "POST", bad)).status).toBe(400);
    }
    expect(await ctx.db.select().from(schema.routines)).toHaveLength(0);
    expect(
      (await asUser(admin.cookie, `${ROUTINES}/not-a-uuid`, "PATCH", { title: "x" })).status,
    ).toBe(404);
  });
});

describe("routines on the speaker", () => {
  it("puts the next 7 days of a member's routine on the speakers serving them", async () => {
    const { admin, carol, key } = await setup();
    const created = await createRoutine(admin.cookie, {
      memberId: carol.id,
      title: "Wake up",
      message: "Good morning, Carol!",
      time: "06:45",
      weekDays: EVERY_DAY,
      skipHolidays: false,
      includeBriefing: false,
    });
    expect(created.speakers.map((s) => s.name)).toEqual(["Kids' room"]);
    expect(created.next).not.toBeNull();

    const items = (await schedule(key)).filter((i) => i.kind === "routine");
    expect(items.length).toBeGreaterThanOrEqual(7);
    expect(items.length).toBeLessThanOrEqual(8);
    expect(items[0]).toMatchObject({
      id: expect.stringMatching(new RegExp(`^routine:${created.id}:\\d{4}-\\d{2}-\\d{2}$`)),
      sound: "beeps",
      text: "Good morning, Carol!",
    });
    // Every instant is 06:45 on the household clock.
    for (const i of items) {
      expect(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: TZ,
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(i.at)),
      ).toBe("06:45");
    }
  });

  it("doesn't reach a speaker that doesn't serve the member", async () => {
    const { admin, bob, key } = await setup();
    await createRoutine(admin.cookie, {
      memberId: bob.id,
      title: "Wake up",
      time: "06:00",
      weekDays: EVERY_DAY,
    });
    expect(await schedule(key)).toEqual([]);
  });

  it("drops a skipped date and brings it back when the skip is undone", async () => {
    const { admin, carol, key } = await setup();
    const r = await createRoutine(admin.cookie, {
      memberId: carol.id,
      title: "Wake up",
      time: "06:45",
      weekDays: EVERY_DAY,
      skipHolidays: false,
    });
    const nextDate = r.next?.date as string;
    const skipped = (await (
      await asUser(admin.cookie, `${ROUTINES}/${r.id}/skip`, "POST", {})
    ).json()) as RoutineJson;
    expect(skipped.skips).toEqual([nextDate]);
    expect((await schedule(key)).map((i) => i.id)).not.toContain(`routine:${r.id}:${nextDate}`);

    await asUser(admin.cookie, `${ROUTINES}/${r.id}/skip/${nextDate}`, "DELETE");
    expect((await schedule(key)).map((i) => i.id)).toContain(`routine:${r.id}:${nextDate}`);
  });

  it("disabling or deleting a routine takes it off the speaker", async () => {
    const { admin, carol, key } = await setup();
    const r = await createRoutine(admin.cookie, {
      memberId: carol.id,
      title: "Bedtime",
      time: "20:00",
      weekDays: EVERY_DAY,
    });
    await asUser(admin.cookie, `${ROUTINES}/${r.id}`, "PATCH", { enabled: false });
    expect(await schedule(key)).toEqual([]);
    await asUser(admin.cookie, `${ROUTINES}/${r.id}`, "PATCH", { enabled: true });
    expect((await schedule(key)).length).toBeGreaterThan(0);
    expect((await asUser(admin.cookie, `${ROUTINES}/${r.id}`, "DELETE")).status).toBe(200);
    expect(await schedule(key)).toEqual([]);
  });

  it("reads the member's events in the briefing but never private ones", async () => {
    const { admin, carol, key } = await setup();
    const r = await createRoutine(admin.cookie, {
      memberId: carol.id,
      title: "Wake up",
      message: "Good morning!",
      time: "06:45",
      weekDays: EVERY_DAY,
      skipHolidays: false,
    });
    const day = r.next?.date as string;
    // 16:00 and 17:00 local on that day (EST, UTC-5, in November).
    const at = (h: number) =>
      new Date(`${day}T${String(h + 5).padStart(2, "0")}:00:00Z`).toISOString();
    for (const [title, isPrivate] of [
      ["Soccer practice", false],
      ["Secret party", true],
    ] as const) {
      const res = await asUser(admin.cookie, "/api/v1/events", "POST", {
        title,
        start: at(isPrivate ? 17 : 16),
        end: at(isPrivate ? 18 : 17),
        private: isPrivate,
        assigneeIds: [carol.id],
      });
      expect(res.status).toBe(201);
    }
    const item = (await schedule(key)).find((i) => i.id === `routine:${r.id}:${day}`);
    expect(item?.text).toBe("Good morning! Today: Soccer practice at 4 PM.");
  });

  it("stores a rang report and shows it as the last result", async () => {
    const { admin, carol, key } = await setup();
    const r = await createRoutine(admin.cookie, {
      memberId: carol.id,
      title: "Wake up",
      time: localTimeIn(-30),
      weekDays: EVERY_DAY,
      skipHolidays: false,
    });
    // Pretend the routine existed this morning, then report today's run.
    await ctx.db
      .update(schema.routines)
      .set({ createdAt: new Date(Date.now() - 24 * 3600_000) })
      .where(eq(schema.routines.id, r.id));
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
      new Date(Date.now() - 30 * 60_000),
    );
    const id = `routine:${r.id}:${date}`;
    const res = await asKey(key, "/api/v1/agent/sync", "POST", {
      schemaVersion: 1,
      agentVersion: "1.0.0",
      rang: [{ id, at: new Date().toISOString(), ok: true }],
    });
    expect(((await res.json()) as { ack: string[] }).ack).toEqual([id]);
    const [view] = (await (await asUser(admin.cookie, ROUTINES)).json()) as RoutineJson[];
    expect(view.last).toMatchObject({ date, ok: true });
  });
});

describe("routine alerts", () => {
  async function alertSetup(minutesFromNow: number) {
    const s = await setup();
    await asUser(s.admin.cookie, "/api/v1/admin/devices/alerts", "PATCH", {
      recipientIds: [s.admin.id],
    });
    const r = await createRoutine(s.admin.cookie, {
      memberId: s.carol.id,
      title: "Wake up",
      time: localTimeIn(minutesFromNow),
      weekDays: EVERY_DAY,
      skipHolidays: false,
    });
    return { ...s, routine: r };
  }

  async function lastSeen(deviceId: string, minutesAgo: number) {
    await ctx.db
      .update(schema.householdDevices)
      .set({ lastSeenAt: new Date(Date.now() - minutesAgo * 60_000) })
      .where(eq(schema.householdDevices.id, deviceId));
  }

  it("warns once, 30 min ahead, when the speaker is offline", async () => {
    const { speaker } = await alertSetup(20);
    await lastSeen(speaker.id, 15);
    const s = spy();
    expect(await checkRoutineAlerts({ emailFn: s.emailFn })).toBe(1);
    expect(s.sent[0].subject).toMatch(/^HomeCal: Carol's Wake up at \d{2}:\d{2} may not ring$/);
    expect(await checkRoutineAlerts({ emailFn: s.emailFn })).toBe(0);
  });

  it("stays quiet ahead of time when the speaker is online", async () => {
    const { speaker } = await alertSetup(20);
    await lastSeen(speaker.id, 0);
    const s = spy();
    expect(await checkRoutineAlerts({ emailFn: s.emailFn })).toBe(0);
  });

  it("alerts once when an occurrence passes without a rang report", async () => {
    const { speaker } = await alertSetup(20);
    await lastSeen(speaker.id, 0);
    const s = spy();
    // 26 minutes from now: the 20-minute occurrence is 6 minutes overdue.
    const later = () => new Date(Date.now() + 26 * 60_000);
    expect(await checkRoutineAlerts({ emailFn: s.emailFn, now: later })).toBe(1);
    expect(s.sent[0].subject).toMatch(/didn't ring$/);
    expect(await checkRoutineAlerts({ emailFn: s.emailFn, now: later })).toBe(0);
  });

  it("doesn't alert when the speaker reported it rang", async () => {
    const { routine, key } = await alertSetup(20);
    const occurrence = new Date(routine.next?.at as string);
    await asKey(key, "/api/v1/agent/sync", "POST", {
      schemaVersion: 1,
      agentVersion: "1.0.0",
      rang: [
        {
          id: `routine:${routine.id}:${routine.next?.date}`,
          at: occurrence.toISOString(),
          ok: true,
        },
      ],
    });
    const s = spy();
    const later = () => new Date(occurrence.getTime() + 6 * 60_000);
    expect(await checkRoutineAlerts({ emailFn: s.emailFn, now: later })).toBe(0);
  });

  it("includes the speaker's reason when it reported a failure", async () => {
    const { routine, key } = await alertSetup(20);
    const occurrence = new Date(routine.next?.at as string);
    await asKey(key, "/api/v1/agent/sync", "POST", {
      schemaVersion: 1,
      agentVersion: "1.0.0",
      rang: [
        {
          id: `routine:${routine.id}:${routine.next?.date}`,
          at: occurrence.toISOString(),
          ok: false,
          error: "tts rc=1",
        },
      ],
    });
    const s = spy();
    const later = () => new Date(occurrence.getTime() + 6 * 60_000);
    expect(await checkRoutineAlerts({ emailFn: s.emailFn, now: later })).toBe(1);
    expect(s.sent[0].body).toContain("tts rc=1");
  });
});
