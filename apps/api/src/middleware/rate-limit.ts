import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";

const PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 600);
const ADMIN_PER_MIN = PER_MIN * 2;

/**
 * Build a stable per-caller rate-limit key with the following precedence:
 *   1. `x-api-key` header value — uniquely identifies a service caller
 *   2. session user id (set by `requireAuth` after the limiter runs, so this
 *      branch only catches requests where some upstream middleware already
 *      ran auth — for the typical web flow we fall through to IP)
 *   3. forwarded IP from `x-forwarded-for` / `x-real-ip` / `anon`
 *
 * Exported separately for unit testing.
 */
export function getRateLimitKey(c: Context): string {
  const apiKey = c.req.header("x-api-key");
  if (apiKey) return `key:${apiKey}`;
  const user = c.get("user") as { id?: string } | undefined;
  if (user?.id) return `user:${user.id}`;
  const fwd = c.req.header("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "anon";
  return `ip:${ip}`;
}

const baseLimiterOptions = {
  windowMs: 60_000,
  standardHeaders: "draft-7" as const,
  keyGenerator: getRateLimitKey,
};

/** Default limiter applied to all `/api/*` routes except `/api/admin/*`. */
export const apiRateLimiter = rateLimiter({
  ...baseLimiterOptions,
  limit: PER_MIN,
  message: { error: "Too many requests" },
});

/**
 * Higher-quota limiter for admin endpoints — the web UI hits these on every
 * Family page load, so they should not be throttled at the same level as
 * machine callers.
 */
export const adminRateLimiter = rateLimiter({
  ...baseLimiterOptions,
  limit: ADMIN_PER_MIN,
  message: { error: "Too many admin requests" },
});
