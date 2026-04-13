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
  const cookie = getSessionCookie(res);
  const body = (await res.json()) as { user: { id: string } };
  return { cookie, userId: body.user.id };
}

interface ServiceAccountResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  isService: boolean;
  createdAt: string;
}

describe("POST /api/admin/service-accounts", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/admin/service-accounts", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const res = await req("/api/admin/service-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: bob.cookie },
      body: JSON.stringify({ name: "grocery-bot" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an empty name", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/service-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a service account with the default user role", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/service-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "Grocery Bot" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ServiceAccountResponse;
    expect(body.name).toBe("Grocery Bot");
    expect(body.role).toBe("user");
    expect(body.isService).toBe(true);
    expect(body.email).toMatch(/^grocery-bot-[0-9a-f]{8}@service\.homecal\.local$/);
    // Throwaway password is NEVER returned
    expect(body).not.toHaveProperty("password");
  });

  it("creates a service account with admin role + custom color", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/service-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "Sync Bot", role: "admin", color: "#10b981" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ServiceAccountResponse;
    expect(body.role).toBe("admin");
    expect(body.color).toBe("#10b981");
  });

  it("excludes service accounts from /api/users", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");

    await req("/api/admin/service-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "Grocery Bot" }),
    });

    const usersRes = await req("/api/users", { headers: { Cookie: admin.cookie } });
    expect(usersRes.status).toBe(200);
    const list = (await usersRes.json()) as Array<{ id: string; name: string }>;
    expect(list.map((u) => u.name).sort()).toEqual(["Admin", "Bob"]);
    expect(list.find((u) => u.name === "Grocery Bot")).toBeUndefined();
    // Sanity: bob and admin still present
    expect(list.find((u) => u.id === bob.userId)).toBeTruthy();
  });

  it("rejects non-hex color strings", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const res = await req("/api/admin/service-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "Bad Color Bot", color: "not-hex" }),
    });
    expect(res.status).toBe(400);
  });
});

interface ServiceAccountListRow {
  user: {
    id: string;
    name: string;
    role: string;
    banned: boolean | null;
    color: string;
    createdAt: string;
  };
  keys: Array<{
    id: string;
    name: string | null;
    prefix: string | null;
    userId: string;
    enabled: boolean;
    requestCount: number;
    lastRequest: string | null;
    createdAt: string;
  }>;
}

async function createServiceAccount(cookie: string, name: string): Promise<{ id: string }> {
  const res = await req("/api/admin/service-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as { id: string };
}

async function mintKey(cookie: string, userId: string, name: string) {
  await req("/api/admin/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, userId }),
  });
}

describe("GET /api/admin/service-accounts", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/admin/service-accounts");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    await createUser("Admin", "admin@test.com");
    const bob = await createUser("Bob", "bob@test.com");
    const res = await req("/api/admin/service-accounts", {
      headers: { Cookie: bob.cookie },
    });
    expect(res.status).toBe(403);
  });

  it("returns an empty array when there are no service accounts", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    await createUser("Bob", "bob@test.com");
    const res = await req("/api/admin/service-accounts", {
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ServiceAccountListRow[];
    expect(body).toEqual([]);
  });

  it("excludes non-service users from the list", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    await createUser("Bob", "bob@test.com");
    await createServiceAccount(admin.cookie, "Grocery Bot");

    const res = await req("/api/admin/service-accounts", {
      headers: { Cookie: admin.cookie },
    });
    const body = (await res.json()) as ServiceAccountListRow[];
    expect(body.length).toBe(1);
    expect(body[0].user.name).toBe("Grocery Bot");
  });

  it("returns services with their keys, ordered by name asc and keys by createdAt desc", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    const zulu = await createServiceAccount(admin.cookie, "Zulu Bot");
    const alpha = await createServiceAccount(admin.cookie, "Alpha Bot");

    await mintKey(admin.cookie, alpha.id, "alpha-key-1");
    await mintKey(admin.cookie, alpha.id, "alpha-key-2");
    await mintKey(admin.cookie, zulu.id, "zulu-key-1");

    const res = await req("/api/admin/service-accounts", {
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ServiceAccountListRow[];

    expect(body.length).toBe(2);
    // Alpha sorts before Zulu
    expect(body[0].user.name).toBe("Alpha Bot");
    expect(body[1].user.name).toBe("Zulu Bot");

    // Alpha has two keys, newest first
    expect(body[0].keys.length).toBe(2);
    expect(body[0].keys[0].name).toBe("alpha-key-2");
    expect(body[0].keys[1].name).toBe("alpha-key-1");
    // Shape sanity — no plaintext key field
    for (const k of body[0].keys) {
      expect(k).not.toHaveProperty("key");
      expect(k.userId).toBe(alpha.id);
      expect(k.enabled).toBe(true);
      expect(typeof k.requestCount).toBe("number");
    }

    expect(body[1].keys.length).toBe(1);
    expect(body[1].keys[0].name).toBe("zulu-key-1");
  });

  it("returns services with empty keys array when none minted yet", async () => {
    const admin = await createUser("Admin", "admin@test.com");
    await createServiceAccount(admin.cookie, "Keyless Bot");

    const res = await req("/api/admin/service-accounts", {
      headers: { Cookie: admin.cookie },
    });
    const body = (await res.json()) as ServiceAccountListRow[];
    expect(body.length).toBe(1);
    expect(body[0].keys).toEqual([]);
  });
});
