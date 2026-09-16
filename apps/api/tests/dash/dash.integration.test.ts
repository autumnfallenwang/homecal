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

function getSessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  const match = setCookie?.match(/better-auth\.session_token=([^;]+)/);
  return match ? `better-auth.session_token=${match[1]}` : "";
}

async function createUser(name: string, email: string, color = "#3b5bdb") {
  const res = await req("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "password123", color }),
  });
  return getSessionCookie(res);
}

/** Mint an `hc_` API key for the signed-in user. Needs a trusted Origin. */
async function createApiKey(cookie: string): Promise<string> {
  const res = await req("/api/auth/api-key/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({ name: "kindle-wall-display" }),
  });
  const body = (await res.json()) as { key?: string };
  if (!body.key) throw new Error(`no api key returned: ${JSON.stringify(body)}`);
  return body.key;
}

function createEvent(
  cookie: string,
  data: { title: string; start: string; end: string; private?: boolean },
) {
  return req("/api/v1/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify(data),
  });
}

/** An ISO instant at a given UTC hour on today's date. */
function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

describe("GET /api/v1/dash — auth boundary", () => {
  it("returns 401 with no credentials at all", async () => {
    const res = await req("/api/v1/dash");
    expect(res.status).toBe(401);
  });

  // The wall display can only recover from a failure if the failure page
  // retries itself. A JSON body has no meta refresh, so the device would sit
  // on a dead page indefinitely — which is exactly what happened in the field
  // when an exhausted key returned {"error":"Unauthorized"}.
  it("renders errors as self-retrying HTML, never as a dead JSON page", async () => {
    for (const path of ["/api/v1/dash", "/api/v1/dash?key=hc_nope"]) {
      const res = await req(path);
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html).toContain('http-equiv="refresh"');
      expect(html).toContain("HOMECAL");
      expect(html).not.toContain('{"error"');
    }
  });

  it("marks error pages no-store so a failure is never cached", async () => {
    const res = await req("/api/v1/dash");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("returns 401 for a well-formed but unknown key", async () => {
    const res = await req("/api/v1/dash?key=hc_notarealkeyatall");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a key that is not an hc_ token", async () => {
    const res = await req("/api/v1/dash?key=whatever");
    expect(res.status).toBe(401);
  });

  it("accepts a session cookie", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    const res = await req("/api/v1/dash", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("accepts an API key in the query string, with no cookie", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    const key = await createApiKey(cookie);

    const res = await req(`/api/v1/dash?key=${key}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("HOMECAL");
  });

  it("is mounted on the legacy prefix too", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    const res = await req("/api/dash", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/dash — query validation", () => {
  it("rejects an unknown timezone with 400", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    const res = await req("/api/v1/dash?tz=Not/AZone", { headers: { Cookie: cookie } });
    expect(res.status).toBe(400);
    // Also HTML + retry: a bad query param must not strand the display.
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('http-equiv="refresh"');
  });

  it("rejects a refresh interval above the cap with 400", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    const res = await req("/api/v1/dash?refresh=99999", { headers: { Cookie: cookie } });
    expect(res.status).toBe(400);
  });

  it("honours an explicit refresh interval", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    const res = await req("/api/v1/dash?refresh=900", { headers: { Cookie: cookie } });
    expect(await res.text()).toContain('content="900"');
  });

  it("renders the requested timezone rather than the server's", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    const tokyo = await req("/api/v1/dash?tz=Asia/Tokyo", { headers: { Cookie: cookie } });
    const utc = await req("/api/v1/dash?tz=UTC", { headers: { Cookie: cookie } });
    // Tokyo is UTC+9, so for most of the UTC day the two disagree on the date
    // or the clock. Asserting they differ is enough to prove `tz` is applied
    // without making the test depend on when it runs.
    expect(await tokyo.text()).not.toBe(await utc.text());
  });
});

describe("GET /api/v1/dash — content", () => {
  it("renders today's events with times in the family timezone", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    await createEvent(cookie, {
      title: "Soccer practice",
      start: todayAt(11, 30),
      end: todayAt(12, 45),
    });

    const res = await req("/api/v1/dash?tz=UTC", { headers: { Cookie: cookie } });
    const html = await res.text();
    expect(html).toContain("Soccer practice");
    // Both meridiems, because the range crosses noon — same rule the digest uses.
    expect(html).toContain("11:30a–12:45p");
    expect(html).toContain(">A</span>");
  });

  it("omits private events — a wall display is readable by the whole room", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    await createEvent(cookie, {
      title: "Soccer practice",
      start: todayAt(11, 30),
      end: todayAt(12, 45),
    });
    await createEvent(cookie, {
      title: "Confidential appointment",
      start: todayAt(13, 0),
      end: todayAt(14, 0),
      private: true,
    });

    const html = await (await req("/api/v1/dash?tz=UTC", { headers: { Cookie: cookie } })).text();
    expect(html).toContain("Soccer practice");
    expect(html).not.toContain("Confidential appointment");
  });

  it("says so when the day is empty", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    const html = await (await req("/api/v1/dash", { headers: { Cookie: cookie } })).text();
    expect(html).toContain("Nothing on the calendar today.");
  });

  it("sends no-store so a wall display never shows a cached day", async () => {
    const cookie = await createUser("Alice", "alice@example.com");
    const res = await req("/api/v1/dash", { headers: { Cookie: cookie } });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
