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
  const res = await req("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Alice",
      email: "alice@test.com",
      password: "password123",
      color: "#ff0000",
    }),
  });
  return getSessionCookie(res);
}

interface PrefsResponse {
  holidayCountries: string[];
}

describe("GET /api/users/me/preferences", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/users/me/preferences");
    expect(res.status).toBe(401);
  });

  it("derives a default from Accept-Language when unset", async () => {
    const cookie = await signIn();
    const res = await req("/api/users/me/preferences", {
      headers: { Cookie: cookie, "Accept-Language": "en-US,en;q=0.9" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PrefsResponse;
    expect(body.holidayCountries).toEqual(["US"]);
  });

  it("returns an empty array when unset and no Accept-Language header", async () => {
    const cookie = await signIn();
    const res = await req("/api/users/me/preferences", { headers: { Cookie: cookie } });
    const body = (await res.json()) as PrefsResponse;
    expect(body.holidayCountries).toEqual([]);
  });

  it("returns the empty default transiently — does NOT persist", async () => {
    const cookie = await signIn();
    await req("/api/users/me/preferences", {
      headers: { Cookie: cookie, "Accept-Language": "zh-TW" },
    });
    // Second call with no Accept-Language should still fall back to the
    // locale-derived default (because nothing was persisted).
    const res2 = await req("/api/users/me/preferences", { headers: { Cookie: cookie } });
    const body = (await res2.json()) as PrefsResponse;
    expect(body.holidayCountries).toEqual([]);
  });
});

describe("PATCH /api/users/me/preferences", () => {
  it("returns 401 without auth", async () => {
    const res = await req("/api/users/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holidayCountries: ["US"] }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for lowercase country codes", async () => {
    const cookie = await signIn();
    const res = await req("/api/users/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ holidayCountries: ["us"] }),
    });
    expect(res.status).toBe(400);
  });

  it("persists the preference; subsequent GET returns it", async () => {
    const cookie = await signIn();
    const patchRes = await req("/api/users/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ holidayCountries: ["US", "TW"] }),
    });
    expect(patchRes.status).toBe(200);

    const getRes = await req("/api/users/me/preferences", { headers: { Cookie: cookie } });
    const body = (await getRes.json()) as PrefsResponse;
    expect(body.holidayCountries).toEqual(["US", "TW"]);
  });

  it("clears the preference when given an empty array", async () => {
    const cookie = await signIn();
    await req("/api/users/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ holidayCountries: ["US"] }),
    });
    await req("/api/users/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ holidayCountries: [] }),
    });
    // Now falls back to Accept-Language-derived default
    const getRes = await req("/api/users/me/preferences", {
      headers: { Cookie: cookie, "Accept-Language": "zh-Hant-TW" },
    });
    const body = (await getRes.json()) as PrefsResponse;
    expect(body.holidayCountries).toEqual(["TW"]);
  });

  it("enforces the 20-country max", async () => {
    const cookie = await signIn();
    const tooMany = Array.from({ length: 21 }, () => "US");
    const res = await req("/api/users/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ holidayCountries: tooMany }),
    });
    expect(res.status).toBe(400);
  });
});
