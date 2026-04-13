import { createMiddleware } from "hono/factory";
import type { auth } from "../auth.js";

type Session = typeof auth.$Infer.Session;

export const requireAuth = createMiddleware<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>(async (c, next) => {
  const { auth: authInstance } = await import("../auth.js");
  // Better Auth can throw `APIError` from inside `getSession` when the
  // request carries an invalid/expired/disabled `x-api-key` header. Treat
  // any thrown APIError as an authentication failure rather than letting it
  // bubble up as a 500 from Hono's default error handler.
  let session: Awaited<ReturnType<typeof authInstance.api.getSession>>;
  try {
    session = await authInstance.api.getSession({ headers: c.req.raw.headers });
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
