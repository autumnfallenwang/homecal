import { randomUUID } from "node:crypto";
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
  data: { title: string; start: string; end: string; seriesId?: string },
) {
  const res = await req("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(data),
  });
  return { res, body: await res.json() };
}

describe("Series events", () => {
  it("creates events with shared seriesId", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const seriesId = randomUUID();

    const { body: e1 } = await createEvent(alice, {
      title: "Weekly Standup",
      start: "2026-04-06T09:00:00Z",
      end: "2026-04-06T09:30:00Z",
      seriesId,
    });
    const { body: e2 } = await createEvent(alice, {
      title: "Weekly Standup",
      start: "2026-04-13T09:00:00Z",
      end: "2026-04-13T09:30:00Z",
      seriesId,
    });

    expect(e1.seriesId).toBe(seriesId);
    expect(e2.seriesId).toBe(seriesId);
    expect(e1.id).not.toBe(e2.id);
  });

  it("single events have null seriesId", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body } = await createEvent(alice, {
      title: "One-off",
      start: "2026-04-06T09:00:00Z",
      end: "2026-04-06T10:00:00Z",
    });

    expect(body.seriesId).toBeNull();
  });

  it("GET / returns seriesId in response", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const seriesId = randomUUID();

    await createEvent(alice, {
      title: "Series Event",
      start: "2026-04-06T09:00:00Z",
      end: "2026-04-06T10:00:00Z",
      seriesId,
    });

    const res = await req("/api/events", { headers: { Cookie: alice } });
    const body = await res.json();

    expect(body[0].seriesId).toBe(seriesId);
  });
});

describe("PATCH /api/events/series/:seriesId", () => {
  it("bulk updates all events in a series", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const seriesId = randomUUID();

    await createEvent(alice, {
      title: "Old Title",
      start: "2026-04-06T09:00:00Z",
      end: "2026-04-06T09:30:00Z",
      seriesId,
    });
    await createEvent(alice, {
      title: "Old Title",
      start: "2026-04-13T09:00:00Z",
      end: "2026-04-13T09:30:00Z",
      seriesId,
    });

    const res = await req(`/api/events/series/${seriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "New Title" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(2);

    // Verify all updated
    const listRes = await req("/api/events", { headers: { Cookie: alice } });
    const events = await listRes.json();
    expect(events.every((e: { title: string }) => e.title === "New Title")).toBe(true);
  });

  it("returns 404 for non-existent series", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const res = await req(`/api/events/series/${randomUUID()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "New" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const res = await req(`/api/events/series/${randomUUID()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New" }),
    });

    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/events/series/:seriesId", () => {
  it("bulk deletes all events in a series", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const seriesId = randomUUID();

    await createEvent(alice, {
      title: "To Delete",
      start: "2026-04-06T09:00:00Z",
      end: "2026-04-06T09:30:00Z",
      seriesId,
    });
    await createEvent(alice, {
      title: "To Delete",
      start: "2026-04-13T09:00:00Z",
      end: "2026-04-13T09:30:00Z",
      seriesId,
    });

    const res = await req(`/api/events/series/${seriesId}`, {
      method: "DELETE",
      headers: { Cookie: alice },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(2);

    // Verify all gone
    const listRes = await req("/api/events", { headers: { Cookie: alice } });
    const events = await listRes.json();
    expect(events).toHaveLength(0);
  });

  it("returns 404 for non-existent series", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const res = await req(`/api/events/series/${randomUUID()}`, {
      method: "DELETE",
      headers: { Cookie: alice },
    });

    expect(res.status).toBe(404);
  });

  it("does not delete single events (no seriesId)", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const seriesId = randomUUID();

    // Create a series event and a single event
    await createEvent(alice, {
      title: "Series",
      start: "2026-04-06T09:00:00Z",
      end: "2026-04-06T09:30:00Z",
      seriesId,
    });
    await createEvent(alice, {
      title: "Single",
      start: "2026-04-07T09:00:00Z",
      end: "2026-04-07T10:00:00Z",
    });

    await req(`/api/events/series/${seriesId}`, {
      method: "DELETE",
      headers: { Cookie: alice },
    });

    const listRes = await req("/api/events", { headers: { Cookie: alice } });
    const events = await listRes.json();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Single");
  });
});
