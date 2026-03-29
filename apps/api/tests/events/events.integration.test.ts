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

// Helper: create a user and return their cookie
async function createUser(name: string, email: string, color = "#ff0000") {
  const res = await signUp({ name, email, password: "password123", color });
  return getSessionCookie(res);
}

// Helper: create an event via API
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

// --- CREATE ---

describe("POST /api/events", () => {
  it("creates a shared event (201)", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    const { res, body } = await createEvent(cookie, sharedEvent);

    expect(res.status).toBe(201);
    expect(body.title).toBe("Family Dinner");
    expect(body.private).toBe(false);
    expect(body.ownerId).toBeDefined();
  });

  it("creates a private event", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    const { res, body } = await createEvent(cookie, privateEvent);

    expect(res.status).toBe(201);
    expect(body.private).toBe(true);
  });

  it("sets ownerId from session, not client input", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    // biome-ignore lint/suspicious/noExplicitAny: testing that server ignores extra client fields
    const { body } = await createEvent(cookie, { ...sharedEvent, ownerId: "fake-id" } as any);

    // ownerId should not be the fake one
    expect(body.ownerId).not.toBe("fake-id");
  });

  it("returns 400 for invalid body", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    const res = await req("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await req("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sharedEvent),
    });

    expect(res.status).toBe(401);
  });

  it("logs creation for shared events", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    await createEvent(cookie, sharedEvent);

    const logs = await db.select().from(schema.eventLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("created");
  });

  it("does not log creation for private events", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    await createEvent(cookie, privateEvent);

    const logs = await db.select().from(schema.eventLogs);
    expect(logs).toHaveLength(0);
  });
});

// --- LIST ---

describe("GET /api/events", () => {
  it("lists shared events visible to all users", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");

    await createEvent(alice, sharedEvent);

    const res = await req("/api/events", { headers: { Cookie: bob } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Family Dinner");
  });

  it("shows own private events", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    await createEvent(alice, privateEvent);

    const res = await req("/api/events", { headers: { Cookie: alice } });
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Doctor Appointment");
  });

  it("hides other users private events", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");

    await createEvent(alice, privateEvent);

    const res = await req("/api/events", { headers: { Cookie: bob } });
    const body = await res.json();

    expect(body).toHaveLength(0);
  });

  it("filters by date range (from/to)", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    await createEvent(alice, {
      title: "Early",
      start: "2026-03-01T10:00:00Z",
      end: "2026-03-01T11:00:00Z",
    });
    await createEvent(alice, {
      title: "Mid",
      start: "2026-03-15T10:00:00Z",
      end: "2026-03-15T11:00:00Z",
    });
    await createEvent(alice, {
      title: "Late",
      start: "2026-03-30T10:00:00Z",
      end: "2026-03-30T11:00:00Z",
    });

    const from = "2026-03-10T00:00:00Z";
    const to = "2026-03-20T00:00:00Z";
    const res = await req(`/api/events?from=${from}&to=${to}`, {
      headers: { Cookie: alice },
    });
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Mid");
  });

  it("returns events ordered by start ascending", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    await createEvent(alice, {
      title: "Later",
      start: "2026-03-20T10:00:00Z",
      end: "2026-03-20T11:00:00Z",
    });
    await createEvent(alice, {
      title: "Earlier",
      start: "2026-03-10T10:00:00Z",
      end: "2026-03-10T11:00:00Z",
    });

    const res = await req("/api/events", { headers: { Cookie: alice } });
    const body = await res.json();

    expect(body[0].title).toBe("Earlier");
    expect(body[1].title).toBe("Later");
  });
});

// --- GET SINGLE ---

describe("GET /api/events/:id", () => {
  it("returns a shared event visible to any user", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");

    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, { headers: { Cookie: bob } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("Family Dinner");
  });

  it("includes owner relation", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, { headers: { Cookie: alice } });
    const body = await res.json();

    expect(body.owner).toBeDefined();
    expect(body.owner.name).toBe("Alice");
  });

  it("returns own private event", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, privateEvent);

    const res = await req(`/api/events/${event.id}`, { headers: { Cookie: alice } });
    expect(res.status).toBe(200);
  });

  it("returns 404 for other users private event", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");

    const { body: event } = await createEvent(alice, privateEvent);

    const res = await req(`/api/events/${event.id}`, { headers: { Cookie: bob } });
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent event", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const res = await req("/api/events/00000000-0000-0000-0000-000000000000", {
      headers: { Cookie: alice },
    });
    expect(res.status).toBe(404);
  });
});

// --- UPDATE ---

describe("PATCH /api/events/:id", () => {
  it("updates event title", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "Updated Dinner" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("Updated Dinner");
  });

  it("updates event dates", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const newStart = "2026-03-20T19:00:00Z";
    const res = await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ start: newStart }),
    });
    const body = await res.json();

    expect(new Date(body.start).getTime()).toBe(new Date(newStart).getTime());
  });

  it("updates private flag", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ private: true }),
    });
    const body = await res.json();

    expect(body.private).toBe(true);
  });

  it("allows any authenticated user to update shared events", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: bob },
      body: JSON.stringify({ title: "Bob Updated" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Bob Updated");
  });

  it("returns 400 for invalid body", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent event", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const res = await req("/api/events/00000000-0000-0000-0000-000000000000", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "Ghost" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for other users private event", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");
    const { body: event } = await createEvent(alice, privateEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: bob },
      body: JSON.stringify({ title: "Hacked" }),
    });

    expect(res.status).toBe(404);
  });

  it("logs field-level diff for shared event updates", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "Updated Dinner" }),
    });

    const logs = await db.select().from(schema.eventLogs);
    // 1 from creation + 1 from update
    const updateLog = logs.find((l) => l.action === "updated");
    expect(updateLog).toBeDefined();
    const logChanges = updateLog?.changes as Record<string, Record<string, unknown>> | undefined;
    expect(logChanges?.title?.from).toBe("Family Dinner");
    expect(logChanges?.title?.to).toBe("Updated Dinner");
  });

  it("does not log updates to private events", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, privateEvent);

    await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "Updated Appointment" }),
    });

    const logs = await db.select().from(schema.eventLogs);
    expect(logs).toHaveLength(0);
  });

  it("returns unchanged event for no-op update", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "Family Dinner" }), // same title
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("Family Dinner");

    // Should not create an update log (only the creation log exists)
    const logs = await db.select().from(schema.eventLogs);
    expect(logs.filter((l) => l.action === "updated")).toHaveLength(0);
  });
});

// --- LOGS ---

describe("GET /api/events/:id/logs", () => {
  it("returns logs with user info for shared event", async () => {
    const alice = await createUser("Alice", "alice@test.com", "#ff0000");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}/logs`, {
      headers: { Cookie: alice },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].action).toBe("created");
    expect(body[0].user.name).toBe("Alice");
    expect(body[0].user.color).toBe("#ff0000");
  });

  it("returns logs ordered newest first", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    // Update to create a second log
    await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "Updated Dinner" }),
    });

    const res = await req(`/api/events/${event.id}/logs`, {
      headers: { Cookie: alice },
    });
    const body = await res.json();

    expect(body).toHaveLength(2);
    expect(body[0].action).toBe("updated");
    expect(body[1].action).toBe("created");
  });

  it("includes field-level changes in update logs", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "New Title" }),
    });

    const res = await req(`/api/events/${event.id}/logs`, {
      headers: { Cookie: alice },
    });
    const body = await res.json();

    const updateLog = body.find((l: { action: string }) => l.action === "updated");
    expect(updateLog.changes.title.from).toBe("Family Dinner");
    expect(updateLog.changes.title.to).toBe("New Title");
  });

  it("shows logs from different users", async () => {
    const alice = await createUser("Alice", "alice@test.com", "#ff0000");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");
    const { body: event } = await createEvent(alice, sharedEvent);

    await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: bob },
      body: JSON.stringify({ title: "Bob Updated" }),
    });

    const res = await req(`/api/events/${event.id}/logs`, {
      headers: { Cookie: alice },
    });
    const body = await res.json();

    expect(body).toHaveLength(2);
    const users = body.map((l: { user: { name: string } }) => l.user.name);
    expect(users).toContain("Alice");
    expect(users).toContain("Bob");
  });

  it("returns empty array for private events (no logs created)", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, privateEvent);

    const res = await req(`/api/events/${event.id}/logs`, {
      headers: { Cookie: alice },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(0);
  });

  it("returns 404 for other users private event logs", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");
    const { body: event } = await createEvent(alice, privateEvent);

    const res = await req(`/api/events/${event.id}/logs`, {
      headers: { Cookie: bob },
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent event", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const res = await req("/api/events/00000000-0000-0000-0000-000000000000/logs", {
      headers: { Cookie: alice },
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}/logs`);

    expect(res.status).toBe(401);
  });
});

// --- DELETE ---

describe("DELETE /api/events/:id", () => {
  it("deletes a shared event (any authenticated user)", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "DELETE",
      headers: { Cookie: bob },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Verify it's gone
    const remaining = await db.select().from(schema.events);
    expect(remaining).toHaveLength(0);
  });

  it("deletes own private event", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, privateEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "DELETE",
      headers: { Cookie: alice },
    });

    expect(res.status).toBe(200);
  });

  it("returns 404 for other users private event", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");
    const { body: event } = await createEvent(alice, privateEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "DELETE",
      headers: { Cookie: bob },
    });

    expect(res.status).toBe(404);

    // Event still exists
    const remaining = await db.select().from(schema.events);
    expect(remaining).toHaveLength(1);
  });

  it("returns 404 for non-existent event", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const res = await req("/api/events/00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
      headers: { Cookie: alice },
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(401);
  });
});

// --- ASSIGNEES ---

describe("Event Assignees", () => {
  it("auto-assigns owner when no assigneeIds provided", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body } = await createEvent(alice, sharedEvent);

    expect(body.assignees).toHaveLength(1);
    expect(body.assignees[0].name).toBe("Alice");
  });

  it("assigns specified users when assigneeIds provided", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    await createUser("Bob", "bob@test.com", "#0000ff");

    // Get Bob's user ID
    const usersRes = await req("/api/users", { headers: { Cookie: alice } });
    const usersList = await usersRes.json();
    const bobId = usersList.find((u: { name: string }) => u.name === "Bob").id;

    const res = await req("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ ...sharedEvent, title: "With Bob", assigneeIds: [bobId] }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.assignees).toHaveLength(1);
    expect(body.assignees[0].name).toBe("Bob");
  });

  it("GET / returns assignees array per event", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    await createEvent(alice, sharedEvent);

    const res = await req("/api/events", { headers: { Cookie: alice } });
    const body = await res.json();

    expect(body[0].assignees).toBeDefined();
    expect(body[0].assignees).toHaveLength(1);
    expect(body[0].assignees[0].name).toBe("Alice");
    expect(body[0].assignees[0].color).toBeDefined();
  });

  it("GET /:id returns assignees with user info", async () => {
    const alice = await createUser("Alice", "alice@test.com", "#ff0000");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, { headers: { Cookie: alice } });
    const body = await res.json();

    expect(body.assignees).toHaveLength(1);
    expect(body.assignees[0]).toEqual({
      id: expect.any(String),
      name: "Alice",
      color: "#ff0000",
    });
  });

  it("PATCH with assigneeIds replaces assignees", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    await createUser("Bob", "bob@test.com", "#0000ff");
    const { body: event } = await createEvent(alice, sharedEvent);

    // Get Bob's ID
    const usersRes = await req("/api/users", { headers: { Cookie: alice } });
    const usersList = await usersRes.json();
    const bobId = usersList.find((u: { name: string }) => u.name === "Bob").id;

    const res = await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ assigneeIds: [bobId] }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assignees).toHaveLength(1);
    expect(body.assignees[0].name).toBe("Bob");
  });

  it("PATCH without assigneeIds leaves assignees unchanged", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const { body: event } = await createEvent(alice, sharedEvent);

    const res = await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    const body = await res.json();

    expect(body.assignees).toHaveLength(1);
    expect(body.assignees[0].name).toBe("Alice");
  });

  it("logs assignee changes in event change log", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    await createUser("Bob", "bob@test.com", "#0000ff");
    const { body: event } = await createEvent(alice, sharedEvent);

    const usersRes = await req("/api/users", { headers: { Cookie: alice } });
    const usersList = await usersRes.json();
    const bobId = usersList.find((u: { name: string }) => u.name === "Bob").id;

    await req(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ assigneeIds: [bobId] }),
    });

    const logsRes = await req(`/api/events/${event.id}/logs`, {
      headers: { Cookie: alice },
    });
    const logs = await logsRes.json();

    const updateLog = logs.find((l: { action: string }) => l.action === "updated");
    expect(updateLog).toBeDefined();
    expect(updateLog.changes.assigneeIds).toBeDefined();
    expect(updateLog.changes.assigneeIds.to).toContain(bobId);
  });
});
