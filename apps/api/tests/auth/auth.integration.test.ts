import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import * as schema from "../../src/db/schema.js";

const { users, sessions, accounts, verifications } = schema;

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
  // Clean all auth tables in FK-safe order
  await db.delete(schema.eventLogs);
  await db.delete(schema.events);
  await db.delete(sessions);
  await db.delete(accounts);
  await db.delete(verifications);
  await db.delete(users);
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

function signIn(data: { email: string; password: string }) {
  return req("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function getSessionCookie(res: Response): string | undefined {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return undefined;
  // Better Auth sets a cookie like "better-auth.session_token=<token>; ..."
  const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
  return match ? `better-auth.session_token=${match[1]}` : undefined;
}

describe("sign up", () => {
  it("creates a user and account", async () => {
    const res = await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.name).toBe("Alice");
    expect(body.user.email).toBe("alice@test.com");

    // Verify user in database
    const dbUsers = await db.select().from(users);
    expect(dbUsers).toHaveLength(1);
    expect(dbUsers[0].name).toBe("Alice");
    expect(dbUsers[0].color).toBe("#ff0000");

    // Verify account was created
    const dbAccounts = await db.select().from(accounts);
    expect(dbAccounts).toHaveLength(1);
    expect(dbAccounts[0].providerId).toBe("credential");
  });

  it("returns session cookie on sign up", async () => {
    const res = await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const cookie = getSessionCookie(res);
    expect(cookie).toBeDefined();
  });

  it("rejects duplicate email", async () => {
    await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const res = await signUp({
      name: "Alice2",
      email: "alice@test.com",
      password: "password456",
      color: "#00ff00",
    });

    expect(res.status).not.toBe(200);
  });
});

describe("sign in", () => {
  it("returns session cookie on successful sign in", async () => {
    await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const res = await signIn({
      email: "alice@test.com",
      password: "password123",
    });

    expect(res.status).toBe(200);

    const cookie = getSessionCookie(res);
    expect(cookie).toBeDefined();
  });

  it("rejects wrong password", async () => {
    await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const res = await signIn({
      email: "alice@test.com",
      password: "wrongpassword",
    });

    expect(res.status).not.toBe(200);
  });
});

describe("session", () => {
  it("returns user info with valid session cookie", async () => {
    const signUpRes = await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const cookie = getSessionCookie(signUpRes);
    expect(cookie).toBeDefined();

    const sessionRes = await req("/api/auth/get-session", {
      headers: { Cookie: cookie as string },
    });

    expect(sessionRes.status).toBe(200);
    const body = await sessionRes.json();
    expect(body.user.email).toBe("alice@test.com");
  });

  it("returns 401 without session cookie", async () => {
    const res = await req("/api/auth/get-session");
    // Better Auth returns 200 with null session or 401
    expect([200, 401]).toContain(res.status);
  });
});

describe("sign out", () => {
  it("invalidates the session", async () => {
    const signUpRes = await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const cookie = getSessionCookie(signUpRes) as string;

    // Sign out
    await req("/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    // Session should be invalid now
    const sessionRes = await req("/api/auth/get-session", {
      headers: { Cookie: cookie },
    });

    const body = await sessionRes.json();
    // After sign-out, Better Auth returns null or an object without a valid session
    expect(body?.session ?? null).toBeFalsy();
  });
});

describe("admin role", () => {
  it("first registered user becomes admin", async () => {
    await signUp({
      name: "Admin",
      email: "admin@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const dbUsers = await db.select().from(users);
    expect(dbUsers).toHaveLength(1);
    expect(dbUsers[0].role).toBe("admin");
  });

  it("second registered user gets user role", async () => {
    await signUp({
      name: "Admin",
      email: "admin@test.com",
      password: "password123",
      color: "#ff0000",
    });

    await signUp({
      name: "Regular",
      email: "regular@test.com",
      password: "password456",
      color: "#0000ff",
    });

    const dbUsers = await db.select().from(users);
    const regular = dbUsers.find((u) => u.email === "regular@test.com");
    expect(regular?.role).toBe("user");
  });
});

describe("bearer token auth", () => {
  function getSessionToken(res: Response): string | undefined {
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) return undefined;
    const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
    return match?.[1];
  }

  it("get-session works with bearer token", async () => {
    const signUpRes = await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const token = getSessionToken(signUpRes);
    expect(token).toBeDefined();

    const sessionRes = await req("/api/auth/get-session", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(sessionRes.status).toBe(200);
    const body = await sessionRes.json();
    expect(body.user.email).toBe("alice@test.com");
  });

  it("protected route works with bearer token", async () => {
    const signUpRes = await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const token = getSessionToken(signUpRes);
    expect(token).toBeDefined();

    const res = await app.request("/protected-test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("alice@test.com");
  });

  it("returns 401 with invalid bearer token", async () => {
    const res = await app.request("/protected-test", {
      headers: { Authorization: "Bearer invalid-token-12345" },
    });

    expect(res.status).toBe(401);
  });
});

describe("protected routes", () => {
  it("returns 401 without session", async () => {
    const res = await app.request("/protected-test");
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid session", async () => {
    const signUpRes = await signUp({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    });

    const cookie = getSessionCookie(signUpRes) as string;

    const res = await app.request("/protected-test", {
      headers: { Cookie: cookie },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("alice@test.com");
  });
});
