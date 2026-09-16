import { Hono } from "hono";
import { z } from "zod";
import type { auth } from "../auth.js";
import { requireDashAuth } from "../middleware/dash-auth.js";
import { renderDashError, renderDashPage } from "../services/dash.js";
import { buildTodayDigestEvents } from "../services/digest-scheduler.js";
import { getOrCreateDigestSettings } from "../services/digest-settings.js";

type Session = typeof auth.$Infer.Session;

export const dashApp = new Hono<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>();

dashApp.use(requireDashAuth);

/** True for a timezone the host's ICU data actually knows. */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const dashQuerySchema = z.object({
  // Defaults to the family timezone from digest settings. Never inferred from
  // the client: the Kindle browser reports UTC regardless of device timezone,
  // so a browser-derived zone would roll the day over four hours early.
  tz: z.string().min(1).refine(isValidTimeZone, { message: "Unknown timezone" }).optional(),
  // 0 disables the meta refresh. Capped at an hour; the default of 10 minutes
  // keeps e-ink ghosting and power draw down versus a per-minute redraw.
  refresh: z.coerce.number().int().min(0).max(3600).optional(),
});

// GET / — a self-contained, greyscale HTML page of today's events, sized and
// styled for an e-reader panel. Private events are excluded: this renders
// with no requester identity, exactly like the family digest, because a wall
// display is readable by anyone in the room.
dashApp.get("/", async (c) => {
  const parsed = dashQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    // HTML, not JSON: a bad query param must not strand the display on a
    // page that cannot refresh itself.
    c.header("Cache-Control", "no-store");
    return c.html(renderDashError({ status: 400, message: "Invalid dashboard settings" }), 400);
  }

  const settings = await getOrCreateDigestSettings();
  const tz = parsed.data.tz ?? settings.timezone;
  const now = new Date();
  const events = await buildTodayDigestEvents(tz, now);

  c.header("Cache-Control", "no-store");
  return c.html(renderDashPage({ events, tz, now, refreshSeconds: parsed.data.refresh }));
});
