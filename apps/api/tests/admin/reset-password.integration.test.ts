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
  const res = await signUp({ name, email, password: "originalpass123", color: "#ff0000" });
  const cookie = getSessionCookie(res);
  const body = (await res.json()) as { user: { id: string } };
  return { cookie, userId: body.user.id };
}

describe("POST /api/admin/users/:id/reset-password", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/admin/users/u/reset-password", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const res = await req(`/api/admin/users/${bob.userId}/reset-password`, {
      method: "POST",
      headers: { Cookie: bob.cookie },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown user", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/users/00000000-0000-0000-0000-000000000000/reset-password", {
      method: "POST",
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(404);
  });

  it("returns a 14-char password and the new password authenticates", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");

    const res = await req(`/api/admin/users/${bob.userId}/reset-password`, {
      method: "POST",
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { password: string };
    expect(body.password).toHaveLength(14);
    expect(body.password).not.toMatch(/[0O1lI]/);

    // Old password should no longer work
    const oldRes = await signIn("bob@test.com", "originalpass123");
    expect(oldRes.status).not.toBe(200);

    // New password should sign Bob in successfully
    const newRes = await signIn("bob@test.com", body.password);
    expect(newRes.status).toBe(200);
  });
});
