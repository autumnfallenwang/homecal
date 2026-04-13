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
  // The auth hook promotes the first user to admin; subsequent users are "user".
  const res = await signUp({ name, email, password: "password123", color: "#ff0000" });
  const cookie = getSessionCookie(res);
  const body = (await res.json()) as { user: { id: string } };
  return { cookie, userId: body.user.id };
}

interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
  start: string | null;
  prefix: string | null;
  userId: string;
  expiresAt: string | null;
  createdAt: string;
}

describe("POST /api/admin/api-keys", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/admin/api-keys", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const res = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: bob.cookie },
      body: JSON.stringify({ name: "test", userId: bob.userId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "", userId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown target user", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({
        name: "ghost",
        userId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("creates a key and returns plaintext once", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const res = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "integration-test", userId: bob.userId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CreateApiKeyResponse;
    expect(body.name).toBe("integration-test");
    expect(body.userId).toBe(bob.userId);
    expect(typeof body.key).toBe("string");
    expect(body.key.length).toBeGreaterThan(10);
    expect(body.prefix).toBe("hc_");
    expect(body.key.startsWith("hc_")).toBe(true);
  });

  it("created key authenticates requests via x-api-key header", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const createRes = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "service-user", userId: bob.userId }),
    });
    const { key } = (await createRes.json()) as CreateApiKeyResponse;

    // Hit a regular protected endpoint with the API key instead of cookies
    const protectedRes = await req("/api/users", {
      headers: { "x-api-key": key },
    });
    expect(protectedRes.status).toBe(200);
    const users = (await protectedRes.json()) as Array<{ id: string; name: string }>;
    // Bob's API key can see both users (non-admin endpoint)
    expect(users.length).toBe(2);
  });

  it("admin-scoped service key passes requireAdmin, user-scoped does not", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    // Create a second admin (via Better Auth admin setRole)
    const svc = await createUser("Service", "svc@test.com");
    await fetch("http://ignored", {}).catch(() => {}); // no-op
    // Promote svc to admin via the Better Auth admin API
    const promoteRes = await req("/api/auth/admin/set-role", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ userId: svc.userId, role: "admin" }),
    });
    expect([200, 201]).toContain(promoteRes.status);

    // Mint a key for the admin service user
    const adminKeyRes = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "admin-svc", userId: svc.userId }),
    });
    const adminKey = ((await adminKeyRes.json()) as CreateApiKeyResponse).key;

    // Mint a key for a regular user (bob)
    const bob = await createUser("Bob", "bob@test.com");
    const userKeyRes = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "user-svc", userId: bob.userId }),
    });
    const userKey = ((await userKeyRes.json()) as CreateApiKeyResponse).key;

    // Admin-scoped key can list API keys (admin-only endpoint)
    const okRes = await req("/api/admin/api-keys", {
      headers: { "x-api-key": adminKey },
    });
    expect(okRes.status).toBe(200);

    // User-scoped key is rejected by requireAdmin
    const forbiddenRes = await req("/api/admin/api-keys", {
      headers: { "x-api-key": userKey },
    });
    expect(forbiddenRes.status).toBe(403);
  });
});

describe("GET /api/admin/api-keys", () => {
  it("lists masked rows (no plaintext key)", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "one", userId: bob.userId }),
    });
    await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "two", userId: bob.userId }),
    });

    const res = await req("/api/admin/api-keys", { headers: { Cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty("key");
      expect(row).toHaveProperty("start");
      expect(row).toHaveProperty("prefix");
      expect(row).toHaveProperty("userId");
      // Phase 17 task 75: usage metadata surfaced on every row
      expect(row).toHaveProperty("requestCount");
      expect(row).toHaveProperty("lastRequest");
      expect(row).toHaveProperty("enabled");
      expect(row).toHaveProperty("name");
    }
  });

  it("filters by userId query param", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const carol = await createUser("Carol", "carol@test.com");

    for (const u of [bob, carol]) {
      await req("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: admin.cookie },
        body: JSON.stringify({ name: "key", userId: u.userId }),
      });
    }

    const res = await req(`/api/admin/api-keys?userId=${bob.userId}`, {
      headers: { Cookie: admin.cookie },
    });
    const rows = (await res.json()) as Array<{ userId: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].userId).toBe(bob.userId);
  });
});

describe("DELETE /api/admin/api-keys/:id", () => {
  it("revokes a key so it no longer authenticates", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const createRes = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "doomed", userId: bob.userId }),
    });
    const { id, key } = (await createRes.json()) as CreateApiKeyResponse;

    // Works before delete
    const beforeRes = await req("/api/users", { headers: { "x-api-key": key } });
    expect(beforeRes.status).toBe(200);

    const delRes = await req(`/api/admin/api-keys/${id}`, {
      method: "DELETE",
      headers: { Cookie: admin.cookie },
    });
    expect(delRes.status).toBe(200);

    // Fails after delete
    const afterRes = await req("/api/users", { headers: { "x-api-key": key } });
    expect(afterRes.status).toBe(401);
  });

  it("returns 404 for unknown key", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/api-keys/00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/api-keys/:id/rotate", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/admin/api-keys/abc/rotate", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const res = await req("/api/admin/api-keys/00000000-0000-0000-0000-000000000000/rotate", {
      method: "POST",
      headers: { Cookie: bob.cookie },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown key", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/api-keys/00000000-0000-0000-0000-000000000000/rotate", {
      method: "POST",
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(404);
  });

  it("mints a new key with the same name + userId, echoes rotatedFromId", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const createRes = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "grocery-bot-prod", userId: bob.userId }),
    });
    const original = (await createRes.json()) as CreateApiKeyResponse;

    const rotateRes = await req(`/api/admin/api-keys/${original.id}/rotate`, {
      method: "POST",
      headers: { Cookie: admin.cookie },
    });
    expect(rotateRes.status).toBe(200);
    const rotated = (await rotateRes.json()) as CreateApiKeyResponse & {
      rotatedFromId: string;
    };
    expect(rotated.id).not.toBe(original.id);
    expect(rotated.name).toBe("grocery-bot-prod");
    expect(rotated.userId).toBe(bob.userId);
    expect(rotated.key).toBeTruthy();
    expect(rotated.key).not.toBe(original.key);
    expect(rotated.rotatedFromId).toBe(original.id);
  });

  it("does NOT delete the old key — both old and new authenticate during the grace window", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const createRes = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "grace-period", userId: bob.userId }),
    });
    const original = (await createRes.json()) as CreateApiKeyResponse;

    const rotateRes = await req(`/api/admin/api-keys/${original.id}/rotate`, {
      method: "POST",
      headers: { Cookie: admin.cookie },
    });
    const rotated = (await rotateRes.json()) as CreateApiKeyResponse;

    // Old key still works
    const oldRes = await req("/api/users", { headers: { "x-api-key": original.key } });
    expect(oldRes.status).toBe(200);
    // New key works
    const newRes = await req("/api/users", { headers: { "x-api-key": rotated.key } });
    expect(newRes.status).toBe(200);

    // Admin manually revokes the old one
    const delRes = await req(`/api/admin/api-keys/${original.id}`, {
      method: "DELETE",
      headers: { Cookie: admin.cookie },
    });
    expect(delRes.status).toBe(200);

    // Old key no longer works
    const oldAfter = await req("/api/users", { headers: { "x-api-key": original.key } });
    expect(oldAfter.status).toBe(401);
    // New key still works
    const newAfter = await req("/api/users", { headers: { "x-api-key": rotated.key } });
    expect(newAfter.status).toBe(200);
  });
});
