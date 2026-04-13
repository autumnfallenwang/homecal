import { holidaysQuerySchema } from "@homecal/shared";
import { Hono } from "hono";
import type { auth } from "../auth.js";
import { requireAuth } from "../middleware/auth.js";
import { getHolidays, listCountries } from "../services/holidays.js";

type Session = typeof auth.$Infer.Session;

export const holidaysApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

holidaysApp.use(requireAuth);

// GET /countries — list of supported ISO 3166-1 alpha-2 codes + display names
// for the settings UI's country multi-select.
holidaysApp.get("/countries", (c) => {
  return c.json(listCountries());
});

// GET / — list public holidays for the given country list + date range.
// Multi-country (`countries=US,TW`) merges same-date entries into one row.
holidaysApp.get("/", (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = holidaysQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const countries = parsed.data.countries.split(",");
  try {
    const result = getHolidays({
      countries,
      from: parsed.data.from,
      to: parsed.data.to,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch holidays";
    return c.json({ error: message }, 400);
  }
});
