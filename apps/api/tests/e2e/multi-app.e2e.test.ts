/**
 * End-to-end smoke for the Phase 16 "open HomeCal as a service" surface.
 *
 * Walks the entire third-party-service journey in one sequential test:
 *   1. Admin signs up (first user → auto-promoted to admin)
 *   2. Service user signs up
 *   3. Admin promotes the service user to admin
 *   4. Admin mints an API key for the service user via /api/admin/api-keys
 *   5. Cookie discarded — every subsequent call uses ONLY `x-api-key`
 *   6. Service user calls /api/v1/users
 *   7. Service user hits the legacy /api/users → expects Deprecation header
 *   8. Service user creates an event via /api/v1/events
 *   9. Service user lists events via /api/v1/events?from=&to=
 *  10. Service user calls /api/v1/events/today
 *  11. Service user calls an admin route under /api/v1
 *  12. Service user fetches /api/openapi.json
 *  13. Admin revokes the key
 *  14. Service user calls /api/v1/users again → expects 401
 *
 * Excluded from `pnpm test:fast` (the usual /check pass) so it doesn't
 * run on every commit. Runs via `pnpm test:e2e` or as part of the full
 * `pnpm test` suite.
 */

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

async function signUp(name: string, email: string) {
  const res = await req("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "password123", color: "#ff0000" }),
  });
  const setCookie = res.headers.get("set-cookie");
  const match = setCookie?.match(/better-auth\.session_token=([^;]+)/);
  const cookie = match ? `better-auth.session_token=${match[1]}` : "";
  const body = (await res.json()) as { user: { id: string; role?: string } };
  return { cookie, userId: body.user.id };
}

interface CreateApiKeyResponse {
  id: string;
  key: string;
  name: string;
  prefix: string | null;
  userId: string;
}

interface UsersListItem {
  id: string;
  name: string;
  color: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

interface TodayResponse {
  serverNow: string;
  today: CalendarEvent[];
  tomorrow: { count: number; firstTitle: string | null; hasMultiDayStart: boolean };
}

interface OpenApiSpec {
  openapi: string;
  info: { title: string };
  paths: Record<string, unknown>;
}

describe("E2E: multi-app service-to-service journey", () => {
  it("walks the full Phase 16 surface end to end", async () => {
    // ─── 1. Admin signs up (first user → auto-admin via auth hook) ───
    const admin = await signUp("Admin", "admin@e2e.test");

    // ─── 2. Service user signs up ───
    const svc = await signUp("Grocery Bot", "grocery-bot@e2e.test");

    // ─── 3. Admin promotes the service user to admin via Better Auth ───
    const promoteRes = await req("/api/auth/admin/set-role", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ userId: svc.userId, role: "admin" }),
    });
    expect([200, 201]).toContain(promoteRes.status);

    // ─── 4. Admin mints an API key for the service user ───
    const mintRes = await req("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ name: "grocery-bot-prod", userId: svc.userId }),
    });
    expect(mintRes.status).toBe(200);
    const minted = (await mintRes.json()) as CreateApiKeyResponse;
    expect(minted.key).toBeTruthy();
    expect(minted.key.startsWith("hc_")).toBe(true);
    const apiKey = minted.key;
    const apiKeyId = minted.id;

    // ─── 5. Cookie discarded — every call below uses ONLY the api key ───
    const apiKeyHeaders = { "x-api-key": apiKey } as const;

    // ─── 6. List family members via /api/v1/users ───
    const v1UsersRes = await req("/api/v1/users", { headers: apiKeyHeaders });
    expect(v1UsersRes.status).toBe(200);
    expect(v1UsersRes.headers.get("deprecation")).toBeNull();
    const v1Users = (await v1UsersRes.json()) as UsersListItem[];
    expect(v1Users.length).toBe(2);
    expect(v1Users.map((u) => u.name).sort()).toEqual(["Admin", "Grocery Bot"]);

    // ─── 7. Hit the legacy /api/users — same data, with Deprecation header ───
    const legacyUsersRes = await req("/api/users", { headers: apiKeyHeaders });
    expect(legacyUsersRes.status).toBe(200);
    expect(legacyUsersRes.headers.get("deprecation")).toBe("true");
    expect(legacyUsersRes.headers.get("sunset")).toBeTruthy();
    const link = legacyUsersRes.headers.get("link");
    expect(link).toContain("/api/v1/users");
    expect(link).toContain('rel="successor-version"');
    const legacyUsers = (await legacyUsersRes.json()) as UsersListItem[];
    expect(legacyUsers).toEqual(v1Users);

    // ─── 8. Create an event via /api/v1/events using the api key ───
    const eventStart = new Date(Date.now() + 60 * 60 * 1000); // 1h from now
    const eventEnd = new Date(eventStart.getTime() + 30 * 60 * 1000);
    const createEventRes = await req("/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...apiKeyHeaders },
      body: JSON.stringify({
        title: "Buy milk",
        start: eventStart.toISOString(),
        end: eventEnd.toISOString(),
        location: "Whole Foods",
      }),
    });
    expect(createEventRes.status).toBe(201);
    const createdEvent = (await createEventRes.json()) as CalendarEvent;
    expect(createdEvent.title).toBe("Buy milk");

    // ─── 9. List events via /api/v1/events — should include the new one ───
    const listFrom = new Date(eventStart.getTime() - 60 * 60 * 1000).toISOString();
    const listTo = new Date(eventEnd.getTime() + 60 * 60 * 1000).toISOString();
    const listRes = await req(
      `/api/v1/events?from=${encodeURIComponent(listFrom)}&to=${encodeURIComponent(listTo)}`,
      { headers: apiKeyHeaders },
    );
    expect(listRes.status).toBe(200);
    const events = (await listRes.json()) as CalendarEvent[];
    expect(events.find((e) => e.id === createdEvent.id)).toBeTruthy();

    // ─── 10. Today snapshot via /api/v1/events/today ───
    const todayRes = await req("/api/v1/events/today?tz=UTC", { headers: apiKeyHeaders });
    expect(todayRes.status).toBe(200);
    const today = (await todayRes.json()) as TodayResponse;
    expect(typeof today.serverNow).toBe("string");
    expect(Array.isArray(today.today)).toBe(true);
    expect(today.tomorrow).toMatchObject({
      count: expect.any(Number),
      hasMultiDayStart: expect.any(Boolean),
    });

    // ─── 11. Admin route under /api/v1 — proves admin scope passes via api key ───
    const adminSessionsRes = await req(`/api/v1/admin/users/${svc.userId}/sessions`, {
      headers: apiKeyHeaders,
    });
    expect(adminSessionsRes.status).toBe(200);

    // ─── 12. Fetch the OpenAPI spec ───
    const specRes = await req("/api/openapi.json");
    expect(specRes.status).toBe(200);
    const spec = (await specRes.json()) as OpenApiSpec;
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("HomeCal API");
    expect(spec.paths).toHaveProperty("/events");
    expect(spec.paths).toHaveProperty("/events/today");
    expect(spec.paths).toHaveProperty("/admin/api-keys");

    // ─── 13. Admin revokes the api key ───
    const deleteRes = await req(`/api/admin/api-keys/${apiKeyId}`, {
      method: "DELETE",
      headers: { Cookie: admin.cookie },
    });
    expect(deleteRes.status).toBe(200);

    // ─── 14. Same call as step 6 with the revoked key → 401 ───
    const afterRevokeRes = await req("/api/v1/users", { headers: apiKeyHeaders });
    expect(afterRevokeRes.status).toBe(401);
  });
});
