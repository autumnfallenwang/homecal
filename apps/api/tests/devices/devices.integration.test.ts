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
  await db.delete(schema.deviceTokens);
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

describe("POST /api/devices", () => {
  it("registers a device (201)", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const res = await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "device-token-123" }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.platform).toBe("ios");
    expect(body.token).toBe("device-token-123");
  });

  it("upserts same token (updates timestamp)", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "device-token-123" }),
    });

    const res = await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "device-token-123" }),
    });

    expect(res.status).toBe(201);

    // Should still be only 1 device
    const listRes = await req("/api/devices", { headers: { Cookie: alice } });
    const devices = await listRes.json();
    expect(devices).toHaveLength(1);
  });

  it("returns 400 for invalid platform", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const res = await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "android", token: "abc" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "ios", token: "abc" }),
    });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/devices", () => {
  it("lists current user's devices", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "token-1" }),
    });
    await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "web", token: "token-2" }),
    });

    const res = await req("/api/devices", { headers: { Cookie: alice } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
  });

  it("does not show other user's devices", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");

    await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "alice-token" }),
    });

    const res = await req("/api/devices", { headers: { Cookie: bob } });
    const body = await res.json();

    expect(body).toHaveLength(0);
  });
});

describe("DELETE /api/devices/:id", () => {
  it("unregisters a device", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const createRes = await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "token-1" }),
    });
    const device = await createRes.json();

    const res = await req(`/api/devices/${device.id}`, {
      method: "DELETE",
      headers: { Cookie: alice },
    });

    expect(res.status).toBe(200);

    const listRes = await req("/api/devices", { headers: { Cookie: alice } });
    const devices = await listRes.json();
    expect(devices).toHaveLength(0);
  });

  it("returns 404 for other user's device", async () => {
    const alice = await createUser("Alice", "alice@test.com");
    const bob = await createUser("Bob", "bob@test.com", "#0000ff");

    const createRes = await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "alice-token" }),
    });
    const device = await createRes.json();

    const res = await req(`/api/devices/${device.id}`, {
      method: "DELETE",
      headers: { Cookie: bob },
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const alice = await createUser("Alice", "alice@test.com");

    const createRes = await req("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: alice },
      body: JSON.stringify({ platform: "ios", token: "token-1" }),
    });
    const device = await createRes.json();

    const res = await req(`/api/devices/${device.id}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(401);
  });
});
