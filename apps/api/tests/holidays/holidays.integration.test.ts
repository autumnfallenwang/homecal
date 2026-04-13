/* biome-ignore-all lint/security/noSecrets: test URLs with query params look like secrets to the entropy check */
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

async function signIn(): Promise<string> {
  const signUp = await req("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    }),
  });
  return getSessionCookie(signUp);
}

interface HolidayRow {
  date: string;
  title: string;
  countries: string[];
  type: "public";
}

describe("GET /api/holidays", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/holidays?countries=US&from=2026-01-01&to=2026-12-31");
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing countries param", async () => {
    const cookie = await signIn();
    const res = await req("/api/holidays?from=2026-01-01&to=2026-12-31", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for lowercase country codes", async () => {
    const cookie = await signIn();
    const res = await req("/api/holidays?countries=us,tw&from=2026-01-01&to=2026-12-31", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown country code (passes regex but unknown)", async () => {
    const cookie = await signIn();
    const res = await req("/api/holidays?countries=ZZ&from=2026-01-01&to=2026-12-31", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Unknown country code/);
  });

  it("returns 400 for malformed from date", async () => {
    const cookie = await signIn();
    const res = await req("/api/holidays?countries=US&from=2026-13-99&to=2026-12-31", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });

  it("returns a US holiday list for the requested year", async () => {
    const cookie = await signIn();
    const res = await req("/api/holidays?countries=US&from=2026-01-01&to=2026-12-31", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as HolidayRow[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(5);
    const jan1 = body.find((h) => h.date === "2026-01-01");
    expect(jan1).toBeTruthy();
    expect(jan1?.countries).toEqual(["US"]);
    expect(jan1?.type).toBe("public");
  });

  it("merges multi-country same-date holidays into a single row", async () => {
    const cookie = await signIn();
    const res = await req("/api/holidays?countries=US,TW&from=2026-01-01&to=2026-01-01", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as HolidayRow[];
    const jan1 = body.filter((h) => h.date === "2026-01-01");
    expect(jan1).toHaveLength(1);
    expect(jan1[0].countries.sort()).toEqual(["TW", "US"]);
  });

  it("is mounted under both /api and /api/v1", async () => {
    const cookie = await signIn();
    const legacy = await req("/api/holidays?countries=US&from=2026-01-01&to=2026-01-31", {
      headers: { Cookie: cookie },
    });
    const v1 = await req("/api/v1/holidays?countries=US&from=2026-01-01&to=2026-01-31", {
      headers: { Cookie: cookie },
    });
    expect(legacy.status).toBe(200);
    expect(v1.status).toBe(200);
  });
});
