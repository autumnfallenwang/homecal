import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.js";
import { requireAuth } from "./middleware/auth.js";
import { eventsApp } from "./routes/events.js";
import { usersApp } from "./routes/users.js";

export const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);

// Better Auth handles all /api/auth/* routes
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/events", eventsApp);
app.route("/api/users", usersApp);

// Example protected route (used by integration tests)
app.get("/protected-test", requireAuth, (c) => {
  return c.json({ user: c.get("user") });
});
