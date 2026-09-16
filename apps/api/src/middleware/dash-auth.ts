import { createMiddleware } from "hono/factory";
import type { auth } from "../auth.js";

type Session = typeof auth.$Infer.Session;

/**
 * Auth gate for the e-ink dashboard (Phase 22).
 *
 * Identical to `requireAuth` except it additionally accepts the API key in a
 * `?key=` query parameter. A wall-mounted e-reader can only ever supply a URL
 * — its browser cannot set an `x-api-key` header, and its Better Auth session
 * cookie would expire weekly, which is not something you can re-enter on an
 * e-ink keyboard behind a picture frame.
 *
 * The key is copied into the header the `apiKey` plugin already understands,
 * so key issuance, scoping and revocation all stay in the existing
 * service-account flow — no parallel token store.
 *
 * Trade-off, deliberately accepted and confined to this one read-only route:
 * a secret in a URL is weaker than one in a header. It can leak via browser
 * history, `Referer`, or any proxy that logs query strings. Our own
 * `requestLog` records `c.req.path`, which excludes the query string, so the
 * key does not reach our logs — but a fronting proxy may still capture it.
 * Use a dedicated service account for the display and revoke it if the device
 * is lost. Cookie and bearer auth still work here unchanged.
 */
export const requireDashAuth = createMiddleware<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>(async (c, next) => {
  const { auth: authInstance } = await import("../auth.js");

  const headers = new Headers(c.req.raw.headers);
  const key = c.req.query("key");
  // An explicit header always wins over the query parameter.
  if (key && !headers.has("x-api-key")) {
    headers.set("x-api-key", key);
  }

  // Better Auth throws `APIError` for an invalid/expired/disabled key; treat
  // it as an auth failure rather than letting it surface as a 500.
  let session: Awaited<ReturnType<typeof authInstance.api.getSession>>;
  try {
    session = await authInstance.api.getSession({ headers });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});
