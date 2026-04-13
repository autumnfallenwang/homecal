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

async function createUser(name: string, email: string, color = "#ff0000") {
  const res = await signUp({ name, email, password: "password123", color });
  const cookie = getSessionCookie(res);
  const session = (await res.json()) as { user: { id: string } };
  return { cookie, userId: session.user.id };
}

async function createEvent(
  cookie: string,
  data: {
    title: string;
    start: string;
    end: string;
    private?: boolean;
    assigneeIds?: string[];
  },
) {
  const res = await req("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(data),
  });
  return { res, body: (await res.json()) as { id: string; title: string } };
}

/**
 * Build an ISO datetime for a given UTC hour "today" so that the server's
 * own `new Date()` falls inside the computed UTC window. We ask for tz=UTC
 * so the window is literally [todayStart, todayEnd) UTC midnight-to-midnight.
 */
function todayAtUtcHour(hour: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
  return d.toISOString();
}

function tomorrowAtUtcHour(hour: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, hour));
  return d.toISOString();
}

interface TodayResponse {
  serverNow: string;
  today: { id: string; title: string }[];
  tomorrow: { count: number; firstTitle: string | null; hasMultiDayStart: boolean };
}

describe("GET /api/events/today", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/events/today?tz=UTC");
    expect(res.status).toBe(401);
  });

  it("returns 400 when tz is missing", async () => {
    const { cookie } = await createUser("Alice", "alice@test.com");
    const res = await req("/api/events/today", { headers: { Cookie: cookie } });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed tz", async () => {
    const { cookie } = await createUser("Alice", "alice@test.com");
    // biome-ignore lint/security/noSecrets: URL-encoded test input, not a secret
    const res = await req("/api/events/today?tz=not%20a%20zone", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown IANA zone", async () => {
    const { cookie } = await createUser("Alice", "alice@test.com");
    const res = await req("/api/events/today?tz=Nowhere/Land", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });

  it("returns shaped response with serverNow, today, tomorrow", async () => {
    const { cookie } = await createUser("Alice", "alice@test.com");
    const res = await req("/api/events/today?tz=UTC", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TodayResponse;
    expect(typeof body.serverNow).toBe("string");
    expect(Array.isArray(body.today)).toBe(true);
    expect(body.tomorrow).toMatchObject({
      count: expect.any(Number),
      hasMultiDayStart: expect.any(Boolean),
    });
  });

  it("includes events that fall inside today and tomorrow", async () => {
    const { cookie } = await createUser("Alice", "alice@test.com");
    await createEvent(cookie, {
      title: "Lunch",
      start: todayAtUtcHour(12),
      end: todayAtUtcHour(13),
    });
    await createEvent(cookie, {
      title: "Breakfast Tomorrow",
      start: tomorrowAtUtcHour(8),
      end: tomorrowAtUtcHour(9),
    });

    const res = await req("/api/events/today?tz=UTC", { headers: { Cookie: cookie } });
    const body = (await res.json()) as TodayResponse;

    expect(body.today).toHaveLength(1);
    expect(body.today[0].title).toBe("Lunch");
    expect(body.tomorrow.count).toBe(1);
    expect(body.tomorrow.firstTitle).toBe("Breakfast Tomorrow");
    expect(body.tomorrow.hasMultiDayStart).toBe(false);
  });

  it("hides another user's private event from today", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com");

    await createEvent(alice.cookie, {
      title: "Alice Private",
      start: todayAtUtcHour(10),
      end: todayAtUtcHour(11),
      private: true,
    });

    const res = await req("/api/events/today?tz=UTC", { headers: { Cookie: bob.cookie } });
    const body = (await res.json()) as TodayResponse;
    expect(body.today).toHaveLength(0);
  });

  it("filters today by userIds assignee set", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com");

    // Alice's event, assigned to Alice only
    await createEvent(alice.cookie, {
      title: "Alice Only",
      start: todayAtUtcHour(9),
      end: todayAtUtcHour(10),
      assigneeIds: [alice.userId],
    });
    // Another event assigned to Bob
    await createEvent(alice.cookie, {
      title: "Bob's Thing",
      start: todayAtUtcHour(14),
      end: todayAtUtcHour(15),
      assigneeIds: [bob.userId],
    });

    const res = await req(`/api/events/today?tz=UTC&userIds=${alice.userId}`, {
      headers: { Cookie: alice.cookie },
    });
    const body = (await res.json()) as TodayResponse;
    expect(body.today.map((e) => e.title)).toEqual(["Alice Only"]);
  });

  it("flags hasMultiDayStart when a multi-day event begins tomorrow", async () => {
    const { cookie } = await createUser("Alice", "alice@test.com");
    // Event starts tomorrow, ends 3 days later
    const start = tomorrowAtUtcHour(10);
    const endDate = new Date(start);
    endDate.setUTCDate(endDate.getUTCDate() + 3);
    await createEvent(cookie, {
      title: "Monterey Trip",
      start,
      end: endDate.toISOString(),
    });

    const res = await req("/api/events/today?tz=UTC", { headers: { Cookie: cookie } });
    const body = (await res.json()) as TodayResponse;
    expect(body.tomorrow.count).toBe(1);
    expect(body.tomorrow.hasMultiDayStart).toBe(true);
  });

  it("returns empty arrays when nothing is scheduled", async () => {
    const { cookie } = await createUser("Alice", "alice@test.com");
    const res = await req("/api/events/today?tz=UTC", { headers: { Cookie: cookie } });
    const body = (await res.json()) as TodayResponse;
    expect(body.today).toEqual([]);
    expect(body.tomorrow.count).toBe(0);
    expect(body.tomorrow.firstTitle).toBeNull();
  });
});
