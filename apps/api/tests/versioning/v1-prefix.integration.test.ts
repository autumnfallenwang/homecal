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
  await db.delete(schema.apikeys);
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

async function createUser(name: string, email: string) {
  const res = await signUp({ name, email, password: "password123", color: "#ff0000" });
  return getSessionCookie(res);
}

describe("API v1 prefix vs legacy /api", () => {
  it("returns identical payloads from /api/users and /api/v1/users", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    await createUser("Bob", "bob@test.com");

    const [legacy, v1] = await Promise.all([
      req("/api/users", { headers: { Cookie: cookie } }),
      req("/api/v1/users", { headers: { Cookie: cookie } }),
    ]);

    expect(legacy.status).toBe(200);
    expect(v1.status).toBe(200);

    const legacyBody = await legacy.json();
    const v1Body = await v1.json();
    expect(legacyBody).toEqual(v1Body);
  });

  it("stamps Deprecation + Sunset + Link headers on legacy /api/* responses", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    const res = await req("/api/users", { headers: { Cookie: cookie } });

    expect(res.headers.get("deprecation")).toBe("true");
    expect(res.headers.get("sunset")).toBeTruthy();
    const link = res.headers.get("link");
    expect(link).toContain("/api/v1/users");
    expect(link).toContain('rel="successor-version"');
  });

  it("does NOT stamp Deprecation headers on /api/v1/* responses", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    const res = await req("/api/v1/users", { headers: { Cookie: cookie } });

    expect(res.headers.get("deprecation")).toBeNull();
    expect(res.headers.get("sunset")).toBeNull();
  });

  it("does NOT stamp Deprecation headers on /api/auth/* responses", async () => {
    const res = await signUp({
      name: "Carol",
      email: "carol@test.com",
      password: "password123",
      color: "#00ff00",
    });
    expect(res.headers.get("deprecation")).toBeNull();
  });

  it("does NOT stamp Deprecation headers on /health", async () => {
    const res = await req("/health");
    expect(res.headers.get("deprecation")).toBeNull();
  });

  it("accepts POST on both prefixes — /api/v1/events creates an event", async () => {
    const cookie = await createUser("Alice", "alice@test.com");
    const eventBody = JSON.stringify({
      title: "Versioned Lunch",
      start: "2026-04-13T12:00:00Z",
      end: "2026-04-13T13:00:00Z",
    });

    const v1Create = await req("/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: eventBody,
    });
    expect(v1Create.status).toBe(201);
    const v1Body = (await v1Create.json()) as { id: string; title: string };
    expect(v1Body.title).toBe("Versioned Lunch");

    // Verify the same row is visible from the legacy prefix
    const legacyList = await req("/api/events", { headers: { Cookie: cookie } });
    expect(legacyList.status).toBe(200);
    const list = (await legacyList.json()) as Array<{ id: string }>;
    expect(list.find((e) => e.id === v1Body.id)).toBeTruthy();
  });

  it("admin endpoints work under both prefixes", async () => {
    // First user is auto-promoted to admin via the auth hook
    const adminCookie = await createUser("Admin", "admin@test.com");

    const adminUserRes = await req("/api/auth/get-session", {
      headers: { Cookie: adminCookie },
    });
    const sessionBody = (await adminUserRes.json()) as { user: { id: string } };
    const adminId = sessionBody.user.id;

    const v1Sessions = await req(`/api/v1/admin/users/${adminId}/sessions`, {
      headers: { Cookie: adminCookie },
    });
    expect(v1Sessions.status).toBe(200);
    expect(v1Sessions.headers.get("deprecation")).toBeNull();

    const legacySessions = await req(`/api/admin/users/${adminId}/sessions`, {
      headers: { Cookie: adminCookie },
    });
    expect(legacySessions.status).toBe(200);
    expect(legacySessions.headers.get("deprecation")).toBe("true");
  });
});
