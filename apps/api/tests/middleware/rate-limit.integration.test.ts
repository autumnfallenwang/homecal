import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { describe, expect, it } from "vitest";
import { getRateLimitKey } from "../../src/middleware/rate-limit.js";

/**
 * Spin up a fresh mini Hono app per test so the in-memory rate-limit store
 * is isolated. We never touch the production app — its limiter is gated on
 * `NODE_ENV !== "test"` and would interfere across vitest workers.
 */
function makeApp(limit: number) {
  const app = new Hono();
  app.use(
    "/api/*",
    rateLimiter({
      windowMs: 60_000,
      limit,
      standardHeaders: "draft-7",
      keyGenerator: getRateLimitKey,
      message: { error: "Too many requests" },
    }),
  );
  app.get("/api/ping", (c) => c.json({ ok: true }));
  return app;
}

describe("rate limiter middleware", () => {
  it("passes the first N requests under the limit", async () => {
    const app = makeApp(5);
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/api/ping", {
        headers: { "x-api-key": "test-key-pass" },
      });
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 once the limit is exceeded", async () => {
    const app = makeApp(3);
    for (let i = 0; i < 3; i++) {
      const ok = await app.request("/api/ping", {
        headers: { "x-api-key": "test-key-block" },
      });
      expect(ok.status).toBe(200);
    }
    const blocked = await app.request("/api/ping", {
      headers: { "x-api-key": "test-key-block" },
    });
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toMatch(/too many/i);
  });

  it("emits draft-7 RateLimit headers on success", async () => {
    const app = makeApp(10);
    const res = await app.request("/api/ping", {
      headers: { "x-api-key": "test-key-headers" },
    });
    expect(res.status).toBe(200);
    // draft-7 uses a single `RateLimit` header (with policy + remaining)
    expect(res.headers.get("ratelimit")).toBeTruthy();
  });

  it("isolates limit buckets by api key", async () => {
    const app = makeApp(2);
    // Burn through key A's quota
    await app.request("/api/ping", { headers: { "x-api-key": "key-a" } });
    await app.request("/api/ping", { headers: { "x-api-key": "key-a" } });
    const aBlocked = await app.request("/api/ping", { headers: { "x-api-key": "key-a" } });
    expect(aBlocked.status).toBe(429);

    // key B is independent
    const bOk = await app.request("/api/ping", { headers: { "x-api-key": "key-b" } });
    expect(bOk.status).toBe(200);
  });

  it("isolates by IP when no api key is present", async () => {
    const app = makeApp(2);
    await app.request("/api/ping", { headers: { "x-forwarded-for": "10.0.0.1" } });
    await app.request("/api/ping", { headers: { "x-forwarded-for": "10.0.0.1" } });
    const ip1Blocked = await app.request("/api/ping", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(ip1Blocked.status).toBe(429);

    // Different IP isn't affected
    const ip2Ok = await app.request("/api/ping", {
      headers: { "x-forwarded-for": "10.0.0.2" },
    });
    expect(ip2Ok.status).toBe(200);
  });
});
