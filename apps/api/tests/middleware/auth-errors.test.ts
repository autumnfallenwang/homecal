import { describe, expect, it } from "vitest";
import { isRateLimitError } from "../../src/lib/auth-errors.js";

describe("isRateLimitError", () => {
  it("matches a numeric 429 status", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
  });

  it("matches Better Auth's SCREAMING_CASE status string", () => {
    expect(isRateLimitError({ status: "TOO_MANY_REQUESTS" })).toBe(true);
  });

  it("matches a rate-limit code or message in the body", () => {
    expect(isRateLimitError({ body: { code: "RATE_LIMITED" } })).toBe(true);
    expect(isRateLimitError({ body: { message: "Rate limit exceeded" } })).toBe(true);
  });

  it("matches a plain error message", () => {
    expect(isRateLimitError(new Error("API key rate limit exceeded"))).toBe(true);
  });

  it("does NOT match an ordinary auth failure", () => {
    // The regression this guards: an invalid key must stay a 401, otherwise
    // every bad credential would be reported as a throttle.
    expect(isRateLimitError({ status: "UNAUTHORIZED" })).toBe(false);
    expect(isRateLimitError({ status: 401, body: { code: "INVALID_API_KEY" } })).toBe(false);
    expect(isRateLimitError(new Error("Invalid API key"))).toBe(false);
  });

  it("does not throw on junk input", () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError("string")).toBe(false);
    expect(isRateLimitError(42)).toBe(false);
    expect(isRateLimitError({})).toBe(false);
    expect(isRateLimitError({ body: null })).toBe(false);
  });
});
