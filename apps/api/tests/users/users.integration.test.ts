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

describe("GET /api/users", () => {
  it("returns 200 with list of users", async () => {
    const cookie = await createUser("Alice", "alice@test.com", "#ff0000");

    const res = await req("/api/users", { headers: { Cookie: cookie } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Alice");
    expect(body[0].color).toBe("#ff0000");
    expect(body[0].id).toBeDefined();
  });

  it("returns only id, name, color (no sensitive fields)", async () => {
    const cookie = await createUser("Alice", "alice@test.com", "#ff0000");

    const res = await req("/api/users", { headers: { Cookie: cookie } });
    const body = await res.json();

    const user = body[0];
    const keys = Object.keys(user);
    expect(keys).toEqual(["id", "name", "color"]);
    expect(user.email).toBeUndefined();
    expect(user.role).toBeUndefined();
    expect(user.password).toBeUndefined();
    expect(user.emailVerified).toBeUndefined();
  });

  it("returns multiple users ordered by name ascending", async () => {
    const cookie = await createUser("Charlie", "charlie@test.com", "#00ff00");
    await createUser("Alice", "alice@test.com", "#ff0000");
    await createUser("Bob", "bob@test.com", "#0000ff");

    const res = await req("/api/users", { headers: { Cookie: cookie } });
    const body = await res.json();

    expect(body).toHaveLength(3);
    expect(body[0].name).toBe("Alice");
    expect(body[1].name).toBe("Bob");
    expect(body[2].name).toBe("Charlie");
  });

  it("includes correct color for each user", async () => {
    const cookie = await createUser("Alice", "alice@test.com", "#ff0000");
    await createUser("Bob", "bob@test.com", "#0000ff");

    const res = await req("/api/users", { headers: { Cookie: cookie } });
    const body = await res.json();

    const alice = body.find((u: { name: string }) => u.name === "Alice");
    const bob = body.find((u: { name: string }) => u.name === "Bob");
    expect(alice.color).toBe("#ff0000");
    expect(bob.color).toBe("#0000ff");
  });

  it("returns 401 without auth", async () => {
    const res = await req("/api/users");

    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid session cookie", async () => {
    const res = await req("/api/users", {
      headers: { Cookie: "better-auth.session_token=invalid-token" },
    });

    expect(res.status).toBe(401);
  });
});
