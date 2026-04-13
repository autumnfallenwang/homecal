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

function signIn(email: string, password: string) {
  return req("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function getSessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  const match = setCookie?.match(/better-auth\.session_token=([^;]+)/);
  return match ? `better-auth.session_token=${match[1]}` : "";
}

async function createUser(name: string, email: string) {
  // The auth hook promotes the first user to admin; subsequent users are "user".
  const res = await signUp({ name, email, password: "password123", color: "#ff0000" });
  const cookie = getSessionCookie(res);
  const body = (await res.json()) as { user: { id: string; role?: string } };
  return { cookie, userId: body.user.id };
}

describe("GET /api/admin/users/:id/sessions", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/admin/users/fake-id/sessions");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    await createUser("Admin", "admin@test.com"); // first user → admin
    const bob = await createUser("Bob", "bob@test.com"); // second user → user

    const res = await req(`/api/admin/users/${bob.userId}/sessions`, {
      headers: { Cookie: bob.cookie },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown user", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/users/00000000-0000-0000-0000-000000000000/sessions", {
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(404);
  });

  it("returns shaped session rows including the current flag", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");

    const res = await req(`/api/admin/users/${admin.userId}/sessions`, {
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      id: string;
      device: string;
      ip: string | null;
      lastActive: string;
      current: boolean;
    }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).toHaveProperty("device");
    expect(body[0]).toHaveProperty("lastActive");
    // The admin's own session should be marked current.
    expect(body.some((s) => s.current)).toBe(true);
    // Confirm bob exists in isolation to cover the non-admin case above.
    expect(bob.userId).toBeDefined();
  });
});

describe("DELETE /api/admin/users/:id/sessions/:sessionId", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/admin/users/u/sessions/s", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const res = await req(`/api/admin/users/${bob.userId}/sessions/whatever`, {
      method: "DELETE",
      headers: { Cookie: bob.cookie },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for a session that doesn't belong to the target user", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    // Try to delete a bogus session id under bob's user id
    const res = await req(
      `/api/admin/users/${bob.userId}/sessions/00000000-0000-0000-0000-000000000000`,
      {
        method: "DELETE",
        headers: { Cookie: admin.cookie },
      },
    );
    expect(res.status).toBe(404);
  });

  it("revokes a specific session", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");

    // Bob has a session from sign-up; fetch it via the admin sessions endpoint
    const listRes = await req(`/api/admin/users/${bob.userId}/sessions`, {
      headers: { Cookie: admin.cookie },
    });
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.length).toBeGreaterThanOrEqual(1);
    const targetSessionId = list[0].id;

    const delRes = await req(`/api/admin/users/${bob.userId}/sessions/${targetSessionId}`, {
      method: "DELETE",
      headers: { Cookie: admin.cookie },
    });
    expect(delRes.status).toBe(200);

    // Bob's sessions should now be empty
    const afterRes = await req(`/api/admin/users/${bob.userId}/sessions`, {
      headers: { Cookie: admin.cookie },
    });
    const after = (await afterRes.json()) as Array<{ id: string }>;
    expect(after.length).toBe(0);
  });
});

describe("DELETE /api/admin/users/:id/sessions", () => {
  it("revokes every session for the target user", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");

    // Give bob a second session by signing in again
    await signIn("bob@test.com", "password123");

    const listRes = await req(`/api/admin/users/${bob.userId}/sessions`, {
      headers: { Cookie: admin.cookie },
    });
    const before = (await listRes.json()) as Array<{ id: string }>;
    expect(before.length).toBeGreaterThanOrEqual(2);

    const delRes = await req(`/api/admin/users/${bob.userId}/sessions`, {
      method: "DELETE",
      headers: { Cookie: admin.cookie },
    });
    expect(delRes.status).toBe(200);
    const delBody = (await delRes.json()) as { ok: boolean; revoked: number };
    expect(delBody.ok).toBe(true);
    expect(delBody.revoked).toBeGreaterThanOrEqual(2);

    const afterRes = await req(`/api/admin/users/${bob.userId}/sessions`, {
      headers: { Cookie: admin.cookie },
    });
    const after = (await afterRes.json()) as Array<{ id: string }>;
    expect(after.length).toBe(0);
  });

  it("returns 404 for an unknown user", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/users/00000000-0000-0000-0000-000000000000/sessions", {
      method: "DELETE",
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(404);
  });
});
