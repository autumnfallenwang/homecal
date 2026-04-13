import { createMiddleware } from "hono/factory";
import type { auth } from "../auth.js";

type Session = typeof auth.$Infer.Session;

/**
 * Must run after `requireAuth` — assumes `user` is on the context.
 * Returns 403 when the user's Better Auth role is not "admin".
 */
export const requireAdmin = createMiddleware<{
  // biome-ignore lint/style/useNamingConvention: Hono middleware Variables convention
  Variables: { user: Session["user"]; session: Session["session"] };
}>((c, next) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
});
