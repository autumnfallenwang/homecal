/**
 * Shared setup for the Phase 23–26 household-device tests. Real PostgreSQL
 * (the dev DB), real Better Auth sign-up and keys, Hono `app.request()`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { app } from "../../src/app.js";
import * as schema from "../../src/db/schema.js";

const TEST_DATABASE_URL = process.env.DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL is required — ensure apps/api/.env exists");
}

export const ctx: {
  client: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle<typeof schema>>;
} = {} as never;

/** Registers beforeAll/afterAll/beforeEach that open a DB and wipe test tables. */
export function useHouseholdDb(extraCleanup?: () => Promise<void>) {
  beforeAll(() => {
    ctx.client = postgres(TEST_DATABASE_URL as string);
    ctx.db = drizzle(ctx.client, { schema });
  });
  afterAll(async () => {
    await ctx.client.end();
  });
  beforeEach(async () => {
    if (extraCleanup) await extraCleanup();
    await wipe();
  });
}

export async function wipe() {
  const { db } = ctx;
  // FK-respecting order: device rows before keys and users.
  for (const table of tablesInDeleteOrder()) {
    await db.delete(table);
  }
}

// A function so later phases can add their tables in one place.
function tablesInDeleteOrder() {
  const t = schema as unknown as Record<string, Parameters<typeof ctx.db.delete>[0] | undefined>;
  const names = [
    "routineRuns",
    "routineSkips",
    "routines",
    "eventReminderDevices",
    "deviceAnnouncements",
    "householdDeviceMembers",
    "householdDevices",
    "apikeys",
    "eventReminders",
    "eventAssignees",
    "eventLogs",
    "events",
    "series",
    "sessions",
    "accounts",
    "verifications",
    "users",
  ];
  return names.map((n) => t[n]).filter((x): x is NonNullable<typeof x> => !!x);
}

export function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

function getSessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  const match = setCookie?.match(/better-auth\.session_token=([^;]+)/);
  return match ? `better-auth.session_token=${match[1]}` : "";
}

/** Sign up a member. The first user in an empty DB becomes admin. */
export async function createUser(name: string, email: string, color = "#3b5bdb") {
  const res = await req("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "password123", color }),
  });
  const body = (await res.json()) as { user: { id: string } };
  return { cookie: getSessionCookie(res), id: body.user.id };
}

/** JSON request as a signed-in user. */
export function asUser(cookie: string, path: string, method = "GET", body?: unknown) {
  return req(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: "http://localhost:3000",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** JSON request authenticated with an API key (how devices call in). */
export function asKey(key: string, path: string, method = "GET", body?: unknown) {
  return req(path, {
    method,
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export interface DeviceViewJson {
  id: string;
  kind: "display" | "speaker";
  name: string;
  room: string | null;
  memberIds: string[];
  settings: Record<string, unknown>;
  offlineAfterMinutes: number;
  alertsEnabled: boolean;
  lastSeenAt: string | null;
  status: string;
  lastStatus: Record<string, unknown> | null;
  key: { id: string; start: string | null; ownedByDevices: boolean } | null;
}

/** Register a device as admin; returns the view and its plaintext key. */
export async function createDevice(adminCookie: string, body: Record<string, unknown>) {
  const res = await asUser(adminCookie, "/api/v1/admin/devices", "POST", body);
  if (res.status !== 201) throw new Error(`create device ${res.status}: ${await res.text()}`);
  return (await res.json()) as { device: DeviceViewJson; key: string | null };
}

/** An admin, a second member (Bob) and a kid (Carol). */
export async function seedFamily() {
  const admin = await createUser("Alice", "alice@example.com");
  const bob = await createUser("Bob", "bob@example.com", "#2f9e44");
  const carol = await createUser("Carol", "carol@example.com", "#e8590c");
  return { admin, bob, carol };
}
