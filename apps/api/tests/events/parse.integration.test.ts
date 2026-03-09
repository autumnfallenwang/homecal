import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import * as schema from "../../src/db/schema.js";

const TEST_DATABASE_URL = process.env.DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL is required — ensure apps/api/.env exists");
}

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  client = postgres(TEST_DATABASE_URL);
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  await db.delete(schema.eventLogs);
  await db.delete(schema.events);
  await db.delete(schema.sessions);
  await db.delete(schema.accounts);
  await db.delete(schema.verifications);
  await db.delete(schema.users);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

function signUp(data: { name: string; email: string; password: string; color: string }) {
  return req("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function getSessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  const match = setCookie?.match(/better-auth\.session_token=([^;]+)/);
  return match ? `better-auth.session_token=${match[1]}` : "";
}

async function createUser(name: string, email: string, color = "#ff0000") {
  const res = await signUp({ name, email, password: "password123", color });
  return getSessionCookie(res);
}

function mockLlmResponse(content: string, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      let url: string;
      if (typeof input === "string") {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = input.url;
      }
      // Only intercept LLM gateway calls; let Hono-internal requests pass through
      if (url.includes("/v1/chat/completions")) {
        if (status !== 200) {
          return Promise.resolve(new Response("Gateway error", { status }));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content } }],
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      // For non-LLM requests, use original fetch
      return originalFetch(input as string | URL | Request);
    }),
  );
}

const originalFetch = globalThis.fetch;

describe("POST /api/events/parse", () => {
  it("returns parsed fields from mocked LLM response (200)", async () => {
    const cookie = await createUser("Alice", "alice@parse.com");

    const llmJson = JSON.stringify({
      title: "Dentist",
      start: "2026-03-10T14:00:00Z",
      end: "2026-03-10T15:00:00Z",
    });
    mockLlmResponse(llmJson);

    const res = await req("/api/events/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ text: "Dentist next Tuesday 2pm" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Dentist");
    expect(body.start).toBe("2026-03-10T14:00:00Z");
    expect(body.end).toBe("2026-03-10T15:00:00Z");
  });

  it("returns 401 without auth", async () => {
    const res = await req("/api/events/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Dentist next Tuesday 2pm" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 for empty text", async () => {
    const cookie = await createUser("Alice", "alice@parse2.com");

    const res = await req("/api/events/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ text: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for missing text field", async () => {
    const cookie = await createUser("Alice", "alice@parse3.com");

    const res = await req("/api/events/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 502 when LLM gateway is unavailable", async () => {
    const cookie = await createUser("Alice", "alice@parse4.com");

    mockLlmResponse("", 503);

    const res = await req("/api/events/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ text: "Dentist tomorrow" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 502 when LLM returns malformed response", async () => {
    const cookie = await createUser("Alice", "alice@parse5.com");

    mockLlmResponse("I don't understand your request");

    const res = await req("/api/events/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ text: "Dentist tomorrow" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
