import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.js";
import { requireAuth } from "./middleware/auth.js";
import { adminRateLimiter, apiRateLimiter } from "./middleware/rate-limit.js";
import { requestLog } from "./middleware/request-log.js";
import { getOpenApiSpec } from "./openapi/spec.js";
import { swaggerUiHtml } from "./openapi/swagger-ui.html.js";
import { adminApp } from "./routes/admin.js";
import { devicesApp } from "./routes/devices.js";
import { eventsApp } from "./routes/events.js";
import { holidaysApp } from "./routes/holidays.js";
import { remindersApp } from "./routes/reminders.js";
import { seriesApp } from "./routes/series.js";
import { usersApp } from "./routes/users.js";

export const app = new Hono();

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

app.use(
  "/*",
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

// Per-request access log — one `event: "http.request"` JSON line per request,
// with req_id stashed for route handlers to correlate via c.get("req_id").
// Mounted before rate-limit so 429s still get logged with their status.
app.use("*", requestLog);

// Per-caller rate limiting on `/api/*` (admin routes get a higher quota).
// Skipped during integration tests so the in-memory store doesn't bleed
// state between tests; integration tests for the limiter spin up their own
// mini Hono app instead.
function isAdminPath(path: string): boolean {
  return path.startsWith("/api/admin/") || path.startsWith("/api/v1/admin/");
}

if (process.env.NODE_ENV !== "test") {
  app.use("/api/*", (c, next) =>
    isAdminPath(c.req.path) ? adminRateLimiter(c, next) : apiRateLimiter(c, next),
  );
}

// Stamp Deprecation + Sunset headers on legacy `/api/*` responses (anything
// that isn't `/api/v1/*` or `/api/auth/*`). Mounted before the route handlers
// so the middleware chain wraps every legacy call. Runs after `next()` so it
// can mutate the outgoing response.
const LEGACY_API_SUNSET = process.env.LEGACY_API_SUNSET ?? "Wed, 01 Jul 2026 00:00:00 GMT";

app.use("/api/*", async (c, next) => {
  await next();
  const path = c.req.path;
  if (
    path.startsWith("/api/v1/") ||
    path.startsWith("/api/auth/") ||
    path === "/api/openapi.json" ||
    path === "/api/docs"
  ) {
    return;
  }
  c.header("Deprecation", "true");
  c.header("Sunset", LEGACY_API_SUNSET);
  c.header("Link", `<${path.replace("/api/", "/api/v1/")}>; rel="successor-version"`);
});

// Better Auth handles all /api/auth/* routes
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) => c.json({ status: "ok" }));

// OpenAPI spec + Swagger UI. Both are public — the spec is documentation
// and reveals nothing not already discoverable by hitting the endpoints.
// Mounted before the deprecation middleware so they don't pick up legacy
// headers (they're versioning-meta surfaces, not API surfaces).
app.get("/api/openapi.json", (c) => c.json(getOpenApiSpec()));
app.get("/api/docs", (c) => c.html(swaggerUiHtml));

// Mount every route group under both the legacy and v1 prefix. The legacy
// `/api/*` mounts will be removed once all callers (web, iOS) migrate to v1.
const apiPrefixes = ["/api", "/api/v1"] as const;
for (const prefix of apiPrefixes) {
  app.route(`${prefix}/events`, eventsApp);
  app.route(`${prefix}/events/:eventId/reminders`, remindersApp);
  app.route(`${prefix}/users`, usersApp);
  app.route(`${prefix}/series`, seriesApp);
  app.route(`${prefix}/devices`, devicesApp);
  app.route(`${prefix}/admin`, adminApp);
  app.route(`${prefix}/holidays`, holidaysApp);
}

// Example protected route (used by integration tests)
app.get("/protected-test", requireAuth, (c) => {
  return c.json({ user: c.get("user") });
});
