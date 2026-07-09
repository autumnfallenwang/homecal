import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the email module at the boundary so no real SMTP send happens — the dev
// .env has live Gmail creds. sendDigestEmail becomes an inspectable spy.
vi.mock("../../src/services/email.js", () => ({
  getEmailConfig: () => ({ from: "test@test", password: "x", smtpServer: "smtp", smtpPort: 587 }),
  sendDigestEmail: vi.fn(async () => ({ success: true })),
  sendReminderEmail: vi.fn(async () => ({ success: true })),
}));

import { app } from "../../src/app.js";
import * as schema from "../../src/db/schema.js";
import { checkDueDigest } from "../../src/services/digest-scheduler.js";
import { saveDigestSettings } from "../../src/services/digest-settings.js";
import { sendDigestEmail } from "../../src/services/email.js";
import { getTodayEvents } from "../../src/services/today.js";

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
  await db.delete(schema.eventReminders);
  await db.delete(schema.eventLogs);
  await db.delete(schema.events);
  await db.delete(schema.series);
  await db.delete(schema.digestSettings);
  await db.delete(schema.sessions);
  await db.delete(schema.accounts);
  await db.delete(schema.verifications);
  await db.delete(schema.users);
  vi.mocked(sendDigestEmail).mockClear();
});

function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

function getSessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  const match = setCookie?.match(/better-auth\.session_token=([^;]+)/);
  return match ? `better-auth.session_token=${match[1]}` : "";
}

async function signUp(name: string, email: string, color: string): Promise<string> {
  const res = await req("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "password123", color }),
  });
  return getSessionCookie(res);
}

async function userId(email: string): Promise<string> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return row.id;
}

const utc = (iso: string) => new Date(iso);

describe("checkDueDigest", () => {
  it("emails each recipient a summary of the day's shared events, excluding private ones", async () => {
    // First signup becomes admin; both default to receivesDailyDigest = true.
    await signUp("Alice", "alice@test.com", "#4F46E5");
    await signUp("Bob", "bob@test.com", "#059669");
    const alice = await userId("alice@test.com");
    const bob = await userId("bob@test.com");

    const [soccer] = await db
      .insert(schema.events)
      .values({
        title: "Soccer practice",
        location: "Community Field",
        start: utc("2026-07-08T16:00:00Z"),
        end: utc("2026-07-08T17:30:00Z"),
        ownerId: alice,
        private: false,
      })
      .returning();
    const [dinner] = await db
      .insert(schema.events)
      .values({
        title: "Family dinner",
        start: utc("2026-07-08T22:30:00Z"),
        end: utc("2026-07-08T23:30:00Z"),
        ownerId: alice,
        private: false,
      })
      .returning();
    // Private event — must NOT appear in the digest.
    await db.insert(schema.events).values({
      title: "Secret meeting",
      start: utc("2026-07-08T18:00:00Z"),
      end: utc("2026-07-08T19:00:00Z"),
      ownerId: alice,
      private: true,
    });
    await db.insert(schema.eventAssignees).values([
      { eventId: soccer.id, userId: alice },
      { eventId: dinner.id, userId: alice },
      { eventId: dinner.id, userId: bob },
    ]);

    await saveDigestSettings({ enabled: true, sendAt: "15:00", timezone: "UTC" });

    const now = utc("2026-07-08T15:00:00Z");
    const sent = await checkDueDigest({ now: () => now });

    expect(sent).toBe(2);
    expect(sendDigestEmail).toHaveBeenCalledTimes(2);

    const recipients = vi.mocked(sendDigestEmail).mock.calls.map((c) => c[1]);
    expect(recipients.sort()).toEqual(["alice@test.com", "bob@test.com"]);

    const body = vi.mocked(sendDigestEmail).mock.calls[0][3];
    expect(body).toContain("Soccer practice");
    expect(body).toContain("Family dinner");
    expect(body).not.toContain("Secret meeting");

    // HTML body is sent alongside the plain text.
    const htmlArg = vi.mocked(sendDigestEmail).mock.calls[0][4];
    expect(htmlArg).toContain("<!doctype html>");
    expect(htmlArg).toContain("Soccer practice");
    expect(htmlArg).not.toContain("Secret meeting");

    const [settings] = await db.select().from(schema.digestSettings);
    expect(settings.lastSentOn).toBe("2026-07-08");
  });

  it("does not resend on a later tick the same day (dedup)", async () => {
    await signUp("Alice", "alice@test.com", "#4F46E5");
    await saveDigestSettings({ enabled: true, sendAt: "15:00", timezone: "UTC" });

    const now = utc("2026-07-08T15:00:00Z");
    expect(await checkDueDigest({ now: () => now })).toBe(1);
    vi.mocked(sendDigestEmail).mockClear();

    // Still inside the send window, but already sent today → dedup, no resend.
    const later = utc("2026-07-08T15:02:00Z");
    expect(await checkDueDigest({ now: () => later })).toBe(0);
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });

  it("does not fire when enabled long after the send time (no retroactive send)", async () => {
    await signUp("Alice", "alice@test.com", "#4F46E5");
    await saveDigestSettings({ enabled: true, sendAt: "07:00", timezone: "UTC" });
    // It's ~7:46 PM locally — far past the 07:00 send time — enabling now must not send.
    const sent = await checkDueDigest({ now: () => utc("2026-07-08T19:46:00Z") });
    expect(sent).toBe(0);
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", async () => {
    await signUp("Alice", "alice@test.com", "#4F46E5");
    await saveDigestSettings({ enabled: false, sendAt: "00:00", timezone: "UTC" });
    expect(await checkDueDigest({ now: () => utc("2026-07-08T15:00:00Z") })).toBe(0);
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });
});

describe("admin digest config API", () => {
  it("requires admin", async () => {
    expect((await req("/api/admin/digest")).status).toBe(401);

    await signUp("Alice", "alice@test.com", "#4F46E5"); // admin
    const bobCookie = await signUp("Bob", "bob@test.com", "#059669"); // regular user
    const res = await req("/api/admin/digest", { headers: { Cookie: bobCookie } });
    expect(res.status).toBe(403);
  });

  it("returns and updates config + recipients", async () => {
    const adminCookie = await signUp("Alice", "alice@test.com", "#4F46E5");
    await signUp("Bob", "bob@test.com", "#059669");
    const alice = await userId("alice@test.com");

    const initial = await req("/api/admin/digest", { headers: { Cookie: adminCookie } });
    expect(initial.status).toBe(200);
    const initialBody = (await initial.json()) as { enabled: boolean; recipientIds: string[] };
    expect(initialBody.enabled).toBe(false);
    expect(initialBody.recipientIds.sort()).toHaveLength(2); // both default in

    const patched = await req("/api/admin/digest", {
      method: "PATCH",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        sendAt: "08:30",
        timezone: "America/New_York",
        recipientIds: [alice],
      }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as {
      enabled: boolean;
      sendAt: string;
      timezone: string;
      recipientIds: string[];
    };
    expect(body.enabled).toBe(true);
    expect(body.sendAt).toBe("08:30");
    expect(body.timezone).toBe("America/New_York");
    expect(body.recipientIds).toEqual([alice]);
  });

  it("rejects an invalid send time", async () => {
    const adminCookie = await signUp("Alice", "alice@test.com", "#4F46E5");
    const res = await req("/api/admin/digest", {
      method: "PATCH",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ sendAt: "25:00" }),
    });
    expect(res.status).toBe(400);
  });

  it("test-send dispatches to current recipients immediately", async () => {
    const adminCookie = await signUp("Alice", "alice@test.com", "#4F46E5");
    const res = await req("/api/admin/digest/test", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recipients: number; sent: number };
    expect(body.recipients).toBe(1);
    expect(body.sent).toBe(1);
    expect(sendDigestEmail).toHaveBeenCalledTimes(1);
  });

  it("serves a printable digest page to admins only", async () => {
    const adminCookie = await signUp("Alice", "alice@test.com", "#4F46E5");
    const bobCookie = await signUp("Bob", "bob@test.com", "#059669");

    const res = await req("/api/admin/digest/print", { headers: { Cookie: adminCookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("window.print()");

    expect((await req("/api/admin/digest/print", { headers: { Cookie: bobCookie } })).status).toBe(
      403,
    );
    expect((await req("/api/admin/digest/print")).status).toBe(401);
  });
});

describe("digest edge cases", () => {
  it("sends a 'nothing today' digest when the day is empty", async () => {
    await signUp("Alice", "alice@test.com", "#4F46E5");
    await saveDigestSettings({ enabled: true, sendAt: "15:00", timezone: "UTC" });

    const sent = await checkDueDigest({ now: () => utc("2026-07-08T15:00:00Z") });
    expect(sent).toBe(1);
    expect(vi.mocked(sendDigestEmail).mock.calls[0][3]).toContain("Nothing on the calendar today");
  });

  it("test-send reports zero when there are no recipients", async () => {
    const adminCookie = await signUp("Alice", "alice@test.com", "#4F46E5");
    // Opt everyone out.
    await req("/api/admin/digest", {
      method: "PATCH",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ recipientIds: [] }),
    });

    const res = await req("/api/admin/digest/test", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    const body = (await res.json()) as { recipients: number; sent: number };
    expect(body).toEqual({ recipients: 0, sent: 0 });
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });

  it("PATCH with only recipientIds leaves the config untouched", async () => {
    const adminCookie = await signUp("Alice", "alice@test.com", "#4F46E5");
    const alice = await userId("alice@test.com");

    const res = await req("/api/admin/digest", {
      method: "PATCH",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ recipientIds: [alice] }),
    });
    const body = (await res.json()) as { enabled: boolean; sendAt: string; recipientIds: string[] };
    expect(body.enabled).toBe(false); // default, unchanged
    expect(body.sendAt).toBe("07:00"); // default, unchanged
    expect(body.recipientIds).toEqual([alice]);
  });

  it("PATCH with an empty body is rejected", async () => {
    const adminCookie = await signUp("Alice", "alice@test.com", "#4F46E5");
    const res = await req("/api/admin/digest", {
      method: "PATCH",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("getTodayEvents visibility", () => {
  it("includes the owner's private events for a requester, excludes all private for the digest", async () => {
    await signUp("Alice", "alice@test.com", "#4F46E5");
    const alice = await userId("alice@test.com");
    await db.insert(schema.events).values({
      title: "Secret",
      start: utc("2026-07-08T16:00:00Z"),
      end: utc("2026-07-08T17:00:00Z"),
      ownerId: alice,
      private: true,
    });

    const now = utc("2026-07-08T15:00:00Z");
    const asOwner = await getTodayEvents({ tz: "UTC", now, requesterId: alice });
    expect(asOwner.todayEvents.map((e) => e.title)).toContain("Secret");

    const forDigest = await getTodayEvents({ tz: "UTC", now, requesterId: null });
    expect(forDigest.todayEvents.map((e) => e.title)).not.toContain("Secret");
  });
});
