import { asc } from "drizzle-orm";
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

// GET / — List all users (id, name, color only)
usersApp.get("/", async (c) => {
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      color: users.color,
    })
    .from(users)
    .orderBy(asc(users.name));

  return c.json(result);
});
