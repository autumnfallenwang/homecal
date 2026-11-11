import { createMiddleware } from "hono/factory";
import type { auth } from "../auth.js";
import { isRateLimitError } from "../lib/auth-errors.js";
import type { HouseholdDeviceRow } from "../services/household-devices.js";

type Session = typeof auth.$Infer.Session;

/**
 * Auth gate for calls made by a household device (Phase 23–24).
 *
 * The device authenticates with its own `hc_` key in `x-api-key`. Better
 * Auth's apiKey plugin turns that into a session whose `session.id` is the
 * key's id, so the device is the one whose `apikeyId` matches. A valid key that
 * belongs to no device (a family member's key, another app's key) is 403: only
 * registered devices may sync. Every authenticated request is a check-in.
 */
export const requireDeviceAuth = createMiddleware<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"]; device: HouseholdDeviceRow };
}>(async (c, next) => {
  const { auth: authInstance } = await import("../auth.js");
  if (!c.req.header("x-api-key")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let session: Awaited<ReturnType<typeof authInstance.api.getSession>>;
  try {
    session = await authInstance.api.getSession({ headers: c.req.raw.headers });
  } catch (err) {
    if (isRateLimitError(err)) {
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { findDeviceByApiKeyId, recordCheckIn } = await import("../services/household-devices.js");
  const device = await findDeviceByApiKeyId(session.session.id);
  if (!device) {
    return c.json({ error: "This key is not registered to a device", code: "NOT_A_DEVICE" }, 403);
  }
  await recordCheckIn(device);

  c.set("user", session.user);
  c.set("session", session.session);
  c.set("device", device);
  return next();
});
