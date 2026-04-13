import { createApiKeyInputSchema } from "@homecal/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { apikeys, sessions, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { generateTempPassword } from "../services/temp-password.js";

type Session = typeof auth.$Infer.Session;

export const adminApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

adminApp.use(requireAuth);
adminApp.use(requireAdmin);

/**
 * Best-effort user-agent → short device label. Parses the first token like
 * "Mozilla/5.0 (Macintosh; ..." → "Macintosh". Falls back to a 40-char trim.
 */
function userAgentToDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const parenMatch = ua.match(/\(([^;)]+)/);
  if (parenMatch?.[1]) return parenMatch[1].trim();
  return ua.slice(0, 40);
}

// GET /users/:id/sessions — list active sessions for a user
adminApp.get("/users/:id/sessions", async (c) => {
  const targetUserId = c.req.param("id");
  const currentSessionId = c.get("session").id;

  const target = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  const rows = await db
    .select({
      id: sessions.id,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, targetUserId))
    .orderBy(desc(sessions.updatedAt));

  const shaped = rows.map((s) => ({
    id: s.id,
    device: userAgentToDevice(s.userAgent),
    ip: s.ipAddress ?? null,
    lastActive: s.updatedAt,
    expiresAt: s.expiresAt,
    current: s.id === currentSessionId,
  }));

  return c.json(shaped);
});

// DELETE /users/:id/sessions/:sessionId — revoke a single session
adminApp.delete("/users/:id/sessions/:sessionId", async (c) => {
  const targetUserId = c.req.param("id");
  const sessionId = c.req.param("sessionId");

  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, targetUserId)),
  });
  if (!row) {
    return c.json({ error: "Session not found" }, 404);
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId));
  return c.json({ ok: true });
});

// DELETE /users/:id/sessions — revoke all sessions for a user
adminApp.delete("/users/:id/sessions", async (c) => {
  const targetUserId = c.req.param("id");

  const target = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  const deleted = await db.delete(sessions).where(eq(sessions.userId, targetUserId)).returning({
    id: sessions.id,
  });
  return c.json({ ok: true, revoked: deleted.length });
});

// POST /users/:id/reset-password — generate a readable temp password and set it
adminApp.post("/users/:id/reset-password", async (c) => {
  const targetUserId = c.req.param("id");

  const target = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  const newPassword = generateTempPassword();
  try {
    await auth.api.setUserPassword({
      body: { userId: targetUserId, newPassword },
      headers: c.req.raw.headers,
    });
  } catch {
    return c.json({ error: "Failed to reset password" }, 500);
  }

  // Return plaintext exactly once — caller is responsible for handing it over.
  return c.json({ password: newPassword });
});

// ─── API keys (Phase 16 task 70) ──────────────────────────────────────────
// Admin-only routes that wrap Better Auth's apiKey plugin so admins can mint
// long-lived service keys owned by a specific target user. The plaintext key
// is returned once on creation and never again.

// POST /api/admin/api-keys — create a key owned by `userId`
adminApp.post("/api-keys", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createApiKeyInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const { name, userId, prefix, expiresInDays } = parsed.data;

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    // Trusted server-side call: do NOT pass headers — Better Auth's
    // createApiKey rejects cross-user creation when called with a session.
    // Our own `requireAdmin` middleware has already authenticated the caller.
    const created = await auth.api.createApiKey({
      body: {
        name,
        userId,
        prefix,
        expiresIn: expiresInDays ? expiresInDays * 24 * 60 * 60 : undefined,
      },
    });
    return c.json({
      id: created.id,
      name: created.name,
      key: created.key, // plaintext — returned once
      start: created.start,
      prefix: created.prefix,
      userId: created.userId,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create API key";
    return c.json({ error: message }, 500);
  }
});

// GET /api/admin/api-keys?userId=<optional> — list masked keys (no plaintext)
adminApp.get("/api-keys", async (c) => {
  const url = new URL(c.req.url);
  const filterUserId = url.searchParams.get("userId");

  const where = filterUserId ? eq(apikeys.userId, filterUserId) : undefined;
  const rows = await db
    .select({
      id: apikeys.id,
      name: apikeys.name,
      start: apikeys.start,
      prefix: apikeys.prefix,
      userId: apikeys.userId,
      enabled: apikeys.enabled,
      createdAt: apikeys.createdAt,
      expiresAt: apikeys.expiresAt,
      lastRequest: apikeys.lastRequest,
    })
    .from(apikeys)
    .where(where)
    .orderBy(desc(apikeys.createdAt));

  return c.json(rows);
});

// DELETE /api/admin/api-keys/:id — revoke a key
adminApp.delete("/api-keys/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.query.apikeys.findFirst({ where: eq(apikeys.id, id) });
  if (!existing) {
    return c.json({ error: "API key not found" }, 404);
  }

  await db.delete(apikeys).where(eq(apikeys.id, id));
  return c.json({ ok: true });
});
