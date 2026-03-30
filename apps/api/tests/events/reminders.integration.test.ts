import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import * as schema from "../../src/db/schema.js";

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

const sharedEvent = {
  title: "Family Dinner",
  start: "2026-03-15T18:00:00Z",
  end: "2026-03-15T20:00:00Z",
};

const privateEvent = {
  title: "Doctor Appointment",
  start: "2026-03-16T10:00:00Z",
  end: "2026-03-16T11:00:00Z",
  private: true,
};

describe("POST /api/events/:eventId/reminders", () => {
  it("creates an email reminder by default (201)", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.minutesBefore).toBe(15);
    expect(body.channel).toBe("email");
    expect(body.eventId).toBe(event.id);
  });

  it("creates a push reminder with explicit channel", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15, channel: "push" }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.channel).toBe("push");
  });

  it("allows same minutesBefore with different channels", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res1 = await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15, channel: "email" }),
    });
    expect(res1.status).toBe(201);

    const res2 = await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15, channel: "push" }),
    });
    expect(res2.status).toBe(201);
  });

  it("returns 409 for duplicate reminder", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    const res = await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid body", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: -5 }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 for other user's private event", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");
    const { body: event } = await createEvent(alice, privateEvent);

    const res = await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: bob },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/events/:eventId/reminders", () => {
  it("lists reminders for an event", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });
    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 60 }),
    });

    const res = await req(`/api/events/${event.id}/reminders`, {
      headers: { Cookie: alice },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].minutesBefore).toBe(15);
    expect(body[0].channel).toBe("email");
    expect(body[1].minutesBefore).toBe(60);
  });
});

describe("DELETE /api/events/:eventId/reminders/:reminderId", () => {
  it("removes a reminder", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const createRes = await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });
    const reminder = await createRes.json();

    const res = await req(`/api/events/${event.id}/reminders/${reminder.id}`, {
      method: "DELETE",
      headers: { Cookie: alice },
    });

    expect(res.status).toBe(200);

    // Verify it's gone
    const listRes = await req(`/api/events/${event.id}/reminders`, {
      headers: { Cookie: alice },
    });
    const list = await listRes.json();
    expect(list).toHaveLength(0);
  });
});

describe("Reminder cascade", () => {
  it("deleting event removes its reminders", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    await req(`/api/events/${event.id}`, {
      method: "DELETE",
      headers: { Cookie: alice },
    });

    const remaining = await db.select().from(schema.eventReminders);
    expect(remaining).toHaveLength(0);
  });
});

describe("GET /api/events includes reminders", () => {
  it("lists events with reminders array", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 15 }),
    });

    const res = await req("/api/events", { headers: { Cookie: alice } });
    const body = await res.json();

    expect(body[0].reminders).toBeDefined();
    expect(body[0].reminders).toHaveLength(1);
    expect(body[0].reminders[0].minutesBefore).toBe(15);
  });

  it("GET /:id includes reminders", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    await req(`/api/events/${event.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ minutesBefore: 60 }),
    });

    const res = await req(`/api/events/${event.id}`, { headers: { Cookie: alice } });
    const body = await res.json();

    expect(body.reminders).toHaveLength(1);
    expect(body.reminders[0].minutesBefore).toBe(60);
  });
});
