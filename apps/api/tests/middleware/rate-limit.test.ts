import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import { getRateLimitKey } from "../../src/middleware/rate-limit.js";

/**
 * Build a minimal Context-like object that satisfies `getRateLimitKey`.
 * We only stub the surface area the function actually touches: `req.header`
 * and `c.get("user")`.
 */
function makeCtx(opts: {
  apiKey?: string;
  user?: { id: string };
  forwardedFor?: string;
  realIp?: string;
}): Context {
  const headers: Record<string, string | undefined> = {
    "x-api-key": opts.apiKey,
    "x-forwarded-for": opts.forwardedFor,
    "x-real-ip": opts.realIp,
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal Context stub for unit tests
  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()],
    },
    get: (key: string) => (key === "user" ? opts.user : undefined),
  } as any;
}

describe("getRateLimitKey", () => {
  it("uses the api key when x-api-key header is present", () => {
    const c = makeCtx({ apiKey: "hc_abc123" });
    expect(getRateLimitKey(c)).toBe("key:hc_abc123");
  });

  it("api key takes precedence over user session", () => {
    const c = makeCtx({ apiKey: "hc_xyz", user: { id: "user-1" } });
    expect(getRateLimitKey(c)).toBe("key:hc_xyz");
  });

  it("falls back to the session user id when no api key", () => {
    const c = makeCtx({ user: { id: "user-42" } });
    expect(getRateLimitKey(c)).toBe("user:user-42");
  });

  it("falls back to x-forwarded-for ip when no auth", () => {
    const c = makeCtx({ forwardedFor: "203.0.113.10" });
    expect(getRateLimitKey(c)).toBe("ip:203.0.113.10");
  });

  it("trims to first ip in a forwarded chain", () => {
    const c = makeCtx({ forwardedFor: "203.0.113.10, 10.0.0.1, 192.168.1.1" });
    expect(getRateLimitKey(c)).toBe("ip:203.0.113.10");
  });

  it("falls back to x-real-ip when no x-forwarded-for", () => {
    const c = makeCtx({ realIp: "198.51.100.7" });
    expect(getRateLimitKey(c)).toBe("ip:198.51.100.7");
  });

  it("falls back to anon when nothing identifies the caller", () => {
    const c = makeCtx({});
    expect(getRateLimitKey(c)).toBe("ip:anon");
  });

  it("user id beats ip", () => {
    const c = makeCtx({ user: { id: "u-1" }, forwardedFor: "1.2.3.4" });
    expect(getRateLimitKey(c)).toBe("user:u-1");
  });
});
