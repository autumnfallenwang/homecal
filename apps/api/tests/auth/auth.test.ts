import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireAuth } from "../../src/middleware/auth.js";

describe("auth module", () => {
  it("exports auth instance from auth.ts", async () => {
    const { auth } = await import("../../src/auth.js");
    expect(auth).toBeDefined();
    expect(auth.handler).toBeTypeOf("function");
    expect(auth.api).toBeDefined();
  });
});

describe("requireAuth middleware", () => {
  it("returns 401 when no session cookie is provided", async () => {
    const app = new Hono();
    app.use("/protected", requireAuth);
    app.get("/protected", (c) => c.json({ ok: true }));

    const res = await app.request("/protected");
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });
});
