import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { series } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

type Session = typeof auth.$Infer.Session;

export const seriesApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

seriesApp.use(requireAuth);

// POST / — Create a series config record
seriesApp.post("/", async (c) => {
  const body = await c.req.json();

  const [record] = await db
    .insert(series)
    .values({
      startDate: body.startDate,
      endDate: body.endDate,
      startTime: body.startTime,
      endTime: body.endTime,
      repeatEvery: body.repeatEvery ?? 1,
      repeatUnit: body.repeatUnit ?? "weeks",
      weekDays: body.weekDays ?? null,
      monthDay: body.monthDay ?? null,
    })
    .returning();

  return c.json(record, 201);
});

// PUT /:id — Update a series config record
seriesApp.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await db.query.series.findFirst({
    where: eq(series.id, id),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  const [updated] = await db
    .update(series)
    .set({
      startDate: body.startDate,
      endDate: body.endDate,
      startTime: body.startTime,
      endTime: body.endTime,
      repeatEvery: body.repeatEvery ?? 1,
      repeatUnit: body.repeatUnit ?? "weeks",
      weekDays: body.weekDays ?? null,
      monthDay: body.monthDay ?? null,
    })
    .where(eq(series.id, id))
    .returning();

  return c.json(updated);
});

// GET /:id — Get series config
seriesApp.get("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await db.query.series.findFirst({
    where: eq(series.id, id),
  });

  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(result);
});
