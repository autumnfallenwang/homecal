import { acceptLanguageToCountry, userPreferencesSchema } from "@homecal/shared";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

type Session = typeof auth.$Infer.Session;

export const usersApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

usersApp.use(requireAuth);

// GET / — List family members for the calendar (id, name, color).
// Phase 17: explicitly excludes service accounts so the calendar member
// filter never shows machine users.
usersApp.get("/", async (c) => {
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      color: users.color,
    })
    .from(users)
    .where(eq(users.isService, false))
    .orderBy(asc(users.name));

  return c.json(result);
});

// GET /me/preferences — the current user's holiday country list. When the
// stored value is null/empty, derive a default from the Accept-Language
// header and return it transiently (the frontend persists via PATCH).
usersApp.get("/me/preferences", async (c) => {
  const userId = c.get("user").id;
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { holidayCountries: true },
  });

  const stored = row?.holidayCountries ?? null;
  if (stored && stored.length > 0) {
    return c.json({ holidayCountries: stored });
  }

  const derived = acceptLanguageToCountry(c.req.header("accept-language") ?? null);
  return c.json({ holidayCountries: derived ? [derived] : [] });
});

// PATCH /me/preferences — update the current user's holiday country list.
// Empty array clears the preference (stored as null) so GET falls back to
// the locale-derived default.
usersApp.patch("/me/preferences", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json().catch(() => null);
  const parsed = userPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const incoming = parsed.data.holidayCountries;
  const toStore = incoming && incoming.length > 0 ? incoming : null;

  await db.update(users).set({ holidayCountries: toStore }).where(eq(users.id, userId));

  return c.json({ holidayCountries: toStore ?? [] });
});
