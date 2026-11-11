import { createRoutineSchema, skipRoutineSchema, updateRoutineSchema } from "@homecal/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { routineSkips, routines } from "../db/schema.js";
import { existingMemberIds } from "../services/household-devices.js";
import { listRoutineViews, nextOccurrenceDate } from "../services/routines.js";

type Session = typeof auth.$Infer.Session;

/**
 * Admin routine management (Phase 25), mounted at `/admin/routines` inside
 * `adminApp` (requireAuth + requireAdmin). Only admins edit routines in v1.
 */
export const adminRoutinesApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

const idParam = z.uuid();
const dateParam = z.iso.date();

async function viewOf(id: string) {
  return (await listRoutineViews()).find((r) => r.id === id) ?? null;
}

async function loadRoutine(raw: string) {
  const id = idParam.safeParse(raw);
  if (!id.success) return null;
  return (await db.query.routines.findFirst({ where: eq(routines.id, id.data) })) ?? null;
}

// GET / — every routine with its next occurrence, last result and speakers
adminRoutinesApp.get("/", async (c) => {
  return c.json(await listRoutineViews());
});

// POST / — create a routine for a member
adminRoutinesApp.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const input = parsed.data;
  if (!(await existingMemberIds([input.memberId])).has(input.memberId)) {
    return c.json({ error: "Unknown member id" }, 400);
  }
  const [row] = await db
    .insert(routines)
    .values({
      memberId: input.memberId,
      title: input.title,
      message: input.message,
      time: input.time,
      weekDays: [...new Set(input.weekDays)].sort().join(","),
      sound: input.sound,
      enabled: input.enabled,
      skipHolidays: input.skipHolidays,
      includeBriefing: input.includeBriefing,
      pausedUntil: input.pausedUntil ?? null,
      createdById: c.get("user").id,
    })
    .returning();
  return c.json(await viewOf(row.id), 201);
});

// PATCH /:id — change any field
adminRoutinesApp.patch("/:id", async (c) => {
  const routine = await loadRoutine(c.req.param("id"));
  if (!routine) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => null);
  const parsed = updateRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const p = parsed.data;
  if (p.memberId && !(await existingMemberIds([p.memberId])).has(p.memberId)) {
    return c.json({ error: "Unknown member id" }, 400);
  }
  const { weekDays, ...rest } = p;
  await db
    .update(routines)
    .set({
      ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
      ...(weekDays ? { weekDays: [...new Set(weekDays)].sort().join(",") } : {}),
      updatedAt: new Date(),
    })
    .where(eq(routines.id, routine.id));
  return c.json(await viewOf(routine.id));
});

// DELETE /:id
adminRoutinesApp.delete("/:id", async (c) => {
  const routine = await loadRoutine(c.req.param("id"));
  if (!routine) return c.json({ error: "Not found" }, 404);
  await db.delete(routines).where(eq(routines.id, routine.id));
  return c.json({ ok: true });
});

// POST /:id/skip — skip one date (default: the next occurrence)
adminRoutinesApp.post("/:id/skip", async (c) => {
  const routine = await loadRoutine(c.req.param("id"));
  if (!routine) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = skipRoutineSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const date = parsed.data.date ?? (await nextOccurrenceDate(routine.id));
  if (!date) return c.json({ error: "No upcoming occurrence to skip" }, 409);
  await db.insert(routineSkips).values({ routineId: routine.id, date }).onConflictDoNothing();
  return c.json(await viewOf(routine.id));
});

// DELETE /:id/skip/:date — undo a skip
adminRoutinesApp.delete("/:id/skip/:date", async (c) => {
  const routine = await loadRoutine(c.req.param("id"));
  const date = dateParam.safeParse(c.req.param("date"));
  if (!routine || !date.success) return c.json({ error: "Not found" }, 404);
  await db
    .delete(routineSkips)
    .where(and(eq(routineSkips.routineId, routine.id), eq(routineSkips.date, date.data)));
  return c.json(await viewOf(routine.id));
});
