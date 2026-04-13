import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
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
