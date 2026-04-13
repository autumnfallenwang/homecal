import * as shared from "@homecal/shared";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * HomeCal OpenAPI 3.1 spec — hand-curated. Schemas under `components.schemas`
 * are derived from `@homecal/shared` Zod definitions via `zod-to-json-schema`
 * so we don't drift from the real validation. Paths are hand-written.
 *
 * Only the stable `/api/v1/*` surface is documented. Better Auth's
 * `/api/auth/*` and the legacy unprefixed `/api/*` mounts are intentionally
 * omitted (see `docs/api-versioning.md`).
 *
 * When you add or change a route in this app, please update this file in the
 * same commit. The integration test in `tests/openapi/spec.integration.test.ts`
 * asserts that key paths are present so spec-rot is loud.
 */

// biome-ignore lint/suspicious/noExplicitAny: zod-to-json-schema only types Zod v3 schemas; ours are Zod v4 but compatible at runtime.
function toComponent(schema: any, name: string) {
  const result = zodToJsonSchema(schema, { target: "openApi3", name });
  // biome-ignore lint/suspicious/noExplicitAny: the result is a JSON Schema fragment — explicit shape is intentional
  const def = (result as any).definitions?.[name] ?? result;
  return def;
}

const ERROR_RESPONSE = {
  description: "Error",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
    },
  },
};

const UNAUTHORIZED = { 401: { ...ERROR_RESPONSE, description: "Unauthorized" } };
const FORBIDDEN = { 403: { ...ERROR_RESPONSE, description: "Forbidden" } };
const NOT_FOUND = { 404: { ...ERROR_RESPONSE, description: "Not found" } };
const VALIDATION = { 400: { ...ERROR_RESPONSE, description: "Validation failed" } };

const EVENT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    title: { type: "string" },
    location: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    start: { type: "string", format: "date-time" },
    end: { type: "string", format: "date-time" },
    ownerId: { type: "string", format: "uuid" },
    private: { type: "boolean" },
    seriesId: { type: "string", format: "uuid", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    assignees: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          color: { type: "string" },
        },
      },
    },
    reminders: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          minutesBefore: { type: "number" },
          channel: { type: "string", enum: ["email", "push"] },
        },
      },
    },
  },
  required: ["id", "title", "start", "end", "ownerId", "private", "assignees"],
};

const USER_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    color: { type: "string" },
  },
  required: ["id", "name", "color"],
};

export function getOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "HomeCal API",
      version: "1.0.0",
      description:
        "Family calendar API. Use `/api/v1/*` paths; `/api/*` (without v1) is deprecated and will be removed — see `docs/api-versioning.md`. Authentication: Better Auth session cookie, bearer token, or `x-api-key` header. Generate a typed client with `openapi-typescript`.",
      contact: {
        name: "HomeCal",
        url: "https://github.com/autumnfallenwang/homecal",
      },
    },
    servers: [{ url: "/api/v1", description: "Stable v1 — recommended for new clients" }],
    tags: [
      { name: "events", description: "Calendar events CRUD + smart input + import/export" },
      { name: "today", description: "Glance-first Today view backend" },
      { name: "series", description: "Recurring event series" },
      { name: "reminders", description: "Per-event reminders (email + push)" },
      { name: "users", description: "Family member directory + preferences" },
      { name: "devices", description: "Device tokens for push notifications" },
      { name: "admin", description: "Admin-only routes (sessions, password reset, API keys)" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description: "Better Auth session cookie set by `/api/auth/sign-in/email`",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Better Auth bearer token from the bearer plugin",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Long-lived service key minted by an admin via `POST /admin/api-keys`",
        },
      },
      schemas: {
        Event: EVENT_SCHEMA,
        User: USER_SCHEMA,
        CreateEvent: toComponent(shared.createEventSchema, "CreateEvent"),
        UpdateEvent: toComponent(shared.updateEventSchema, "UpdateEvent"),
        EventQuery: toComponent(shared.eventQuerySchema, "EventQuery"),
        TodayQuery: toComponent(shared.todayQuerySchema, "TodayQuery"),
        ParseEventInput: toComponent(shared.parseEventInputSchema, "ParseEventInput"),
        ParseImageInput: toComponent(shared.parseImageInputSchema, "ParseImageInput"),
        ImportIcs: toComponent(shared.importIcsSchema, "ImportIcs"),
        ParsedEvent: toComponent(shared.parsedEventSchema, "ParsedEvent"),
        CreateReminder: toComponent(shared.createReminderSchema, "CreateReminder"),
        RegisterDevice: toComponent(shared.registerDeviceSchema, "RegisterDevice"),
        // biome-ignore lint/security/noSecrets: schema name, not a secret
        CreateApiKey: toComponent(shared.createApiKeyInputSchema, "CreateApiKey"),
      },
    },
    security: [{ cookieAuth: [] }, { bearerAuth: [] }, { apiKeyAuth: [] }],
    paths: {
      // ─── Events CRUD ─────────────────────────────────────────────────
      "/events": {
        get: {
          tags: ["events"],
          summary: "List events in a date range",
          parameters: [
            {
              name: "from",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "ISO 8601 — inclusive lower bound on event.start",
            },
            {
              name: "to",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "ISO 8601 — inclusive upper bound on event.start",
            },
          ],
          responses: {
            200: {
              description: "List of events visible to the caller",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Event" } },
                },
              },
            },
            ...UNAUTHORIZED,
          },
        },
        post: {
          tags: ["events"],
          summary: "Create an event",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateEvent" } },
            },
          },
          responses: {
            201: {
              description: "Event created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Event" } },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
          },
        },
      },
      "/events/today": {
        get: {
          tags: ["today"],
          summary: "Timezone-aware Today snapshot",
          parameters: [
            {
              name: "tz",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "IANA timezone, e.g. `America/Los_Angeles`",
            },
            {
              name: "userIds",
              in: "query",
              schema: { type: "string" },
              description: "Optional comma-separated user IDs to filter by assignee",
            },
          ],
          responses: {
            200: {
              description: "Today + tomorrow snapshot",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      serverNow: { type: "string", format: "date-time" },
                      today: { type: "array", items: { $ref: "#/components/schemas/Event" } },
                      tomorrow: {
                        type: "object",
                        properties: {
                          count: { type: "number" },
                          firstTitle: { type: "string", nullable: true },
                          hasMultiDayStart: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
          },
        },
      },
      "/events/{id}": {
        get: {
          tags: ["events"],
          summary: "Get a single event",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: {
              description: "Event",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Event" } },
              },
            },
            ...UNAUTHORIZED,
            ...NOT_FOUND,
          },
        },
        patch: {
          tags: ["events"],
          summary: "Update an event",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/UpdateEvent" } },
            },
          },
          responses: {
            200: { description: "Updated event" },
            ...VALIDATION,
            ...UNAUTHORIZED,
            ...NOT_FOUND,
          },
        },
        delete: {
          tags: ["events"],
          summary: "Delete an event",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { 200: { description: "Deleted" }, ...UNAUTHORIZED, ...NOT_FOUND },
        },
      },
      "/events/parse": {
        post: {
          tags: ["events"],
          summary: "Parse natural-language text into a structured event",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ParseEventInput" } },
            },
          },
          responses: {
            200: {
              description: "Parsed event fields",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ParsedEvent" } },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
          },
        },
      },
      "/events/parse-image": {
        post: {
          tags: ["events"],
          summary: "Parse an image (e.g. flyer photo) into a structured event",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ParseImageInput" } },
            },
          },
          responses: {
            200: {
              description: "Parsed event fields",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ParsedEvent" } },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
          },
        },
      },
      "/events/import": {
        post: {
          tags: ["events"],
          summary: "Import events from an iCalendar (.ics) string",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ImportIcs" } },
            },
          },
          responses: {
            200: {
              description: "Import result counts",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      imported: { type: "number" },
                      skipped: { type: "number" },
                    },
                  },
                },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
          },
        },
      },
      "/events/export.ics": {
        get: {
          tags: ["events"],
          summary: "Export all visible events as iCalendar",
          parameters: [
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            200: {
              description: "iCalendar text",
              content: { "text/calendar": { schema: { type: "string" } } },
            },
            ...UNAUTHORIZED,
          },
        },
      },
      "/events/{id}/export.ics": {
        get: {
          tags: ["events"],
          summary: "Export a single event as iCalendar",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: {
              description: "iCalendar text",
              content: { "text/calendar": { schema: { type: "string" } } },
            },
            ...UNAUTHORIZED,
            ...NOT_FOUND,
          },
        },
      },
      "/events/{id}/logs": {
        get: {
          tags: ["events"],
          summary: "Change log for an event",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: { description: "List of change log entries" },
            ...UNAUTHORIZED,
            ...NOT_FOUND,
          },
        },
      },
      "/events/{id}/reminders": {
        get: {
          tags: ["reminders"],
          summary: "List reminders for an event",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { 200: { description: "Reminder list" }, ...UNAUTHORIZED, ...NOT_FOUND },
        },
        post: {
          tags: ["reminders"],
          summary: "Create a reminder on an event",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateReminder" } },
            },
          },
          responses: { 201: { description: "Created" }, ...VALIDATION, ...UNAUTHORIZED },
        },
      },
      "/events/{id}/reminders/{reminderId}": {
        delete: {
          tags: ["reminders"],
          summary: "Delete a reminder",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "reminderId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: { 200: { description: "Deleted" }, ...UNAUTHORIZED, ...NOT_FOUND },
        },
      },
      "/events/series/{seriesId}": {
        patch: {
          tags: ["series"],
          summary: "Bulk-update shared fields across all events in a series",
          parameters: [
            {
              name: "seriesId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: { 200: { description: "Updated" }, ...UNAUTHORIZED, ...NOT_FOUND },
        },
        delete: {
          tags: ["series"],
          summary: "Bulk-delete every event in a series",
          parameters: [
            {
              name: "seriesId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: { 200: { description: "Deleted" }, ...UNAUTHORIZED, ...NOT_FOUND },
        },
      },
      "/series": {
        post: {
          tags: ["series"],
          summary: "Create a series record",
          responses: { 201: { description: "Created" }, ...VALIDATION, ...UNAUTHORIZED },
        },
      },
      "/series/{id}": {
        get: {
          tags: ["series"],
          summary: "Get a series record",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { 200: { description: "Series" }, ...UNAUTHORIZED, ...NOT_FOUND },
        },
        put: {
          tags: ["series"],
          summary: "Replace a series config",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { 200: { description: "Updated" }, ...VALIDATION, ...UNAUTHORIZED },
        },
      },
      // ─── Users ────────────────────────────────────────────────────────
      "/users": {
        get: {
          tags: ["users"],
          summary: "List family members (id, name, color)",
          responses: {
            200: {
              description: "Family member list",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/User" } },
                },
              },
            },
            ...UNAUTHORIZED,
          },
        },
      },
      // ─── Devices ──────────────────────────────────────────────────────
      "/devices": {
        post: {
          tags: ["devices"],
          summary: "Register a device token for push notifications",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/RegisterDevice" } },
            },
          },
          responses: { 200: { description: "Registered" }, ...VALIDATION, ...UNAUTHORIZED },
        },
        delete: {
          tags: ["devices"],
          summary: "Unregister a device token",
          responses: { 200: { description: "Unregistered" }, ...UNAUTHORIZED },
        },
      },
      // ─── Admin ────────────────────────────────────────────────────────
      "/admin/users/{id}/sessions": {
        get: {
          tags: ["admin"],
          summary: "List active sessions for a user",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: { description: "Session list" },
            ...UNAUTHORIZED,
            ...FORBIDDEN,
            ...NOT_FOUND,
          },
        },
        delete: {
          tags: ["admin"],
          summary: "Revoke every session for a user",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: { description: "Revoked" },
            ...UNAUTHORIZED,
            ...FORBIDDEN,
            ...NOT_FOUND,
          },
        },
      },
      "/admin/users/{id}/sessions/{sessionId}": {
        delete: {
          tags: ["admin"],
          summary: "Revoke a single session",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "sessionId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            200: { description: "Revoked" },
            ...UNAUTHORIZED,
            ...FORBIDDEN,
            ...NOT_FOUND,
          },
        },
      },
      "/admin/users/{id}/reset-password": {
        post: {
          tags: ["admin"],
          summary: "Generate a temp password for a user",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: {
              description: "Plaintext temp password (returned once)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { password: { type: "string" } },
                    required: ["password"],
                  },
                },
              },
            },
            ...UNAUTHORIZED,
            ...FORBIDDEN,
            ...NOT_FOUND,
          },
        },
      },
      "/admin/api-keys": {
        get: {
          tags: ["admin"],
          summary: "List API keys (masked — no plaintext)",
          parameters: [
            {
              name: "userId",
              in: "query",
              schema: { type: "string", format: "uuid" },
              description: "Optional — filter to keys owned by this user",
            },
          ],
          responses: { 200: { description: "Masked key list" }, ...UNAUTHORIZED, ...FORBIDDEN },
        },
        post: {
          tags: ["admin"],
          summary: "Create an API key for a target user (plaintext returned once)",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateApiKey" } },
            },
          },
          responses: {
            200: {
              description: "Created key (plaintext only in this response)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                      key: { type: "string" },
                      start: { type: "string", nullable: true },
                      prefix: { type: "string", nullable: true },
                      userId: { type: "string", format: "uuid" },
                      expiresAt: { type: "string", format: "date-time", nullable: true },
                      createdAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
            ...FORBIDDEN,
            ...NOT_FOUND,
          },
        },
      },
      "/admin/api-keys/{id}": {
        delete: {
          tags: ["admin"],
          summary: "Revoke an API key",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: { description: "Revoked" },
            ...UNAUTHORIZED,
            ...FORBIDDEN,
            ...NOT_FOUND,
          },
        },
      },
    },
  };
}
