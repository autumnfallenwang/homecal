import { registerDeviceSchema } from "@homecal/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { deviceTokens } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

type Session = typeof auth.$Infer.Session;

export const devicesApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

devicesApp.use(requireAuth);

// POST /api/devices — Register a device token (upsert)
devicesApp.post("/", async (c) => {
  const userId = c.get("user").id;

  const body = await c.req.json();
  const parsed = registerDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  // Check if this exact (userId, token) already exists
  const existing = await db.query.deviceTokens.findFirst({
    where: (d, { and, eq }) => and(eq(d.userId, userId), eq(d.token, parsed.data.token)),
  });

  if (existing) {
    // Upsert: update timestamp and platform
    const [updated] = await db
      .update(deviceTokens)
      .set({ updatedAt: new Date(), platform: parsed.data.platform })
      .where(eq(deviceTokens.id, existing.id))
      .returning();
    return c.json(updated, 201);
  }

  const [device] = await db
    .insert(deviceTokens)
    .values({
      userId,
      platform: parsed.data.platform,
      token: parsed.data.token,
    })
    .returning();

  return c.json(device, 201);
});

// GET /api/devices — List current user's devices
devicesApp.get("/", async (c) => {
  const userId = c.get("user").id;

  const devices = await db
    .select({
      id: deviceTokens.id,
      platform: deviceTokens.platform,
      token: deviceTokens.token,
      createdAt: deviceTokens.createdAt,
    })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId))
    .orderBy(deviceTokens.createdAt);

  return c.json(devices);
});

// DELETE /api/devices/:id — Unregister a device
devicesApp.delete("/:id", async (c) => {
  const deviceId = c.req.param("id");
  const userId = c.get("user").id;

  const device = await db.query.deviceTokens.findFirst({
    where: (d, { and, eq }) => and(eq(d.id, deviceId), eq(d.userId, userId)),
  });

  if (!device) return c.json({ error: "Not found" }, 404);

  await db.delete(deviceTokens).where(eq(deviceTokens.id, deviceId));

  return c.json({ success: true });
});
