import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import * as schema from "../../src/db/schema.js";
import { checkDueReminders } from "../../src/services/reminder-scheduler.js";

const TEST_DATABASE_URL = process.env.DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL is required — ensure apps/api/.env exists");
}

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  client = postgres(TEST_DATABASE_URL);
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  await db.delete(schema.deviceTokens);
  await db.delete(schema.eventReminders);
  await db.delete(schema.eventAssignees);
  await db.delete(schema.eventLogs);
  await db.delete(schema.events);
  await db.delete(schema.sessions);
  await db.delete(schema.accounts);
  await db.delete(schema.verifications);
  await db.delete(schema.users);
});

function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

function signUp(data: { name: string; email: string; password: string; color: string }) {
  return req("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function getSessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  const match = setCookie?.match(/better-auth\.session_token=([^;]+)/);
  return match ? `better-auth.session_token=${match[1]}` : "";
}

async function createUser(name: string, email: string, color = "#ff0000") {
  const res = await signUp({ name, email, password: "password123", color });
  return getSessionCookie(res);
}

async function createEvent(
  cookie: string,
  data: { title: string; start: string; end: string; private?: boolean },
) {
  const res = await req("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(data),
  });
  return { res, body: await res.json() };
}

describe("checkDueReminders", () => {
  it("sends due reminders and marks them as sent", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    // Create event starting 10 minutes from now
    const now = new Date();
    const eventStart = new Date(now.getTime() + 10 * 60 * 1000);
    const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);

    const { body: event } = await createEvent(alice, {
      title: "Team Meeting",
      start: eventStart.toISOString(),
      end: eventEnd.toISOString(),
    });

    // Add a 15-minute reminder (due now since event is in 10 min)
    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    // Register a device token
    await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "test-device-token" }),
    });

    // Run scheduler with mock push function
    const pushCalls: { token: string; title: string; body: string }[] = [];
    const mockPush = (
      _config: unknown,
      token: string,
      payload: { title: string; body: string },
    ) => {
      pushCalls.push({ token, title: payload.title, body: payload.body });
      return Promise.resolve({ success: true });
    };

    const count = await checkDueReminders(mockPush);

    expect(count).toBe(1);
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0].token).toBe("test-device-token");
    expect(pushCalls[0].title).toBe("Team Meeting");
    expect(pushCalls[0].body).toBe("in 15 minutes");

    // Verify sentAt was set
    const reminders = await db.select().from(schema.eventReminders);
    expect(reminders[0].sentAt).not.toBeNull();
  });

  it("does not re-send already-sent reminders", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const now = new Date();
    const eventStart = new Date(now.getTime() + 10 * 60 * 1000);
    const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);

    const { body: event } = await createEvent(alice, {
      title: "Meeting",
      start: eventStart.toISOString(),
      end: eventEnd.toISOString(),
    });

    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "test-token" }),
    });

    const mockPush = () => Promise.resolve({ success: true });

    // First run — should send
    const count1 = await checkDueReminders(mockPush);
    expect(count1).toBe(1);

    // Second run — should not re-send
    const count2 = await checkDueReminders(mockPush);
    expect(count2).toBe(0);
  });

  it("skips reminders not yet due", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    // Event is in 2 hours
    const now = new Date();
    const eventStart = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);

    const { body: event } = await createEvent(alice, {
      title: "Later Meeting",
      start: eventStart.toISOString(),
      end: eventEnd.toISOString(),
    });

    // 15-minute reminder — not due yet (event in 2 hours)
    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    const mockPush = () => Promise.resolve({ success: true });
    const count = await checkDueReminders(mockPush);

    expect(count).toBe(0);
  });

  it("removes stale device tokens on BadDeviceToken", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const now = new Date();
    const eventStart = new Date(now.getTime() + 10 * 60 * 1000);
    const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);

    const { body: event } = await createEvent(alice, {
      title: "Meeting",
      start: eventStart.toISOString(),
      end: eventEnd.toISOString(),
    });

    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "bad-token" }),
    });

    const mockPush = () => Promise.resolve({ success: false, reason: "BadDeviceToken" });
    await checkDueReminders(mockPush);

    // Device token should be deleted
    const devices = await db.select().from(schema.deviceTokens);
    expect(devices).toHaveLength(0);
  });

  it("handles no due reminders gracefully", async () => {
    const mockPush = () => Promise.resolve({ success: true });
    const count = await checkDueReminders(mockPush);
    expect(count).toBe(0);
  });
});
