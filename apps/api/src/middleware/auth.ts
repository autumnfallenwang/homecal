import { createMiddleware } from "hono/factory";
import type { auth } from "../auth.js";

type Session = typeof auth.$Infer.Session;

export const requireAuth = createMiddleware<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>(async (c, next) => {
  const { auth: authInstance } = await import("../auth.js");
  const session = await authInstance.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});
