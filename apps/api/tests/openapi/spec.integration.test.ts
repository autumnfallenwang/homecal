import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: Array<{ url: string; description?: string }>;
  tags: Array<{ name: string; description?: string }>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
  security: Array<Record<string, unknown[]>>;
  paths: Record<string, Record<string, { tags: string[]; summary: string }>>;
}

describe("GET /api/openapi.json", () => {
  it("returns a JSON response with status 200", async () => {
    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("returns a valid OpenAPI 3.1 envelope", async () => {
    const res = await app.request("/api/openapi.json");
    const spec = (await res.json()) as OpenApiSpec;
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("HomeCal API");
    expect(spec.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(spec.servers).toHaveLength(1);
    expect(spec.servers[0].url).toBe("/api/v1");
  });

  it("declares the three security schemes (cookie, bearer, apiKey)", async () => {
    const res = await app.request("/api/openapi.json");
    const spec = (await res.json()) as OpenApiSpec;
    expect(Object.keys(spec.components.securitySchemes)).toEqual(
      expect.arrayContaining(["cookieAuth", "bearerAuth", "apiKeyAuth"]),
    );
  });

  it("derives component schemas from the shared Zod definitions", async () => {
    const res = await app.request("/api/openapi.json");
    const spec = (await res.json()) as OpenApiSpec;
    const expected = [
      "Event",
      "User",
      "CreateEvent",
      "UpdateEvent",
      "EventQuery",
      "TodayQuery",
      "ParseEventInput",
      "ParseImageInput",
      "ImportIcs",
      "ParsedEvent",
      "CreateReminder",
      "RegisterDevice",
      // biome-ignore lint/security/noSecrets: schema component name, not a secret
      "CreateApiKey",
    ];
    for (const name of expected) {
      expect(spec.components.schemas).toHaveProperty(name);
    }
  });

  it("documents every major route group", async () => {
    const res = await app.request("/api/openapi.json");
    const spec = (await res.json()) as OpenApiSpec;
    const expected = [
      "/events",
      "/events/{id}",
      "/events/today",
      "/events/parse",
      "/events/import",
      "/events/{id}/reminders",
      "/users",
      "/devices",
      "/admin/users/{id}/sessions",
      "/admin/users/{id}/reset-password",
      "/admin/api-keys",
    ];
    for (const path of expected) {
      expect(spec.paths).toHaveProperty(path);
    }
  });

  it("tags every operation", async () => {
    const res = await app.request("/api/openapi.json");
    const spec = (await res.json()) as OpenApiSpec;
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        expect(op.tags, `${method.toUpperCase()} ${path} missing tags`).toBeTruthy();
        expect(op.tags.length, `${method.toUpperCase()} ${path} has empty tags`).toBeGreaterThan(0);
        expect(op.summary, `${method.toUpperCase()} ${path} missing summary`).toBeTruthy();
      }
    }
  });

  it("does NOT carry the Deprecation header (it's a meta endpoint)", async () => {
    const res = await app.request("/api/openapi.json");
    expect(res.headers.get("deprecation")).toBeNull();
  });
});

describe("GET /api/docs", () => {
  it("returns Swagger UI HTML pointed at the openapi.json", async () => {
    const res = await app.request("/api/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("swagger-ui");
    expect(html).toContain("/api/openapi.json");
  });

  it("does NOT carry the Deprecation header", async () => {
    const res = await app.request("/api/docs");
    expect(res.headers.get("deprecation")).toBeNull();
  });
});
