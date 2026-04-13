/* biome-ignore-all lint/style/useNamingConvention: OpenAPI spec keys are canonical (requestBody, securitySchemes, apiKeyAuth, etc.) */
import * as shared from "@homecal/shared";
import { z } from "zod";

/**
 * HomeCal OpenAPI 3.1 spec — hand-curated. Schemas under `components.schemas`
 * are derived from `@homecal/shared` Zod definitions via Zod v4's native
 * `z.toJSONSchema` so we don't drift from the real validation. Paths are
 * hand-written.
 *
 * Only the stable `/api/v1/*` surface is documented. Better Auth's
 * `/api/auth/*` and the legacy unprefixed `/api/*` mounts are intentionally
 * omitted (see `docs/api-versioning.md`).
 *
 * When you add or change a route in this app, please update this file in the
 * same commit. The integration test in `tests/openapi/spec.integration.test.ts`
 * asserts that key paths are present so spec-rot is loud.
 */

// biome-ignore lint/suspicious/noExplicitAny: Zod v4's toJSONSchema types are schema-instance-specific; we pass heterogeneous shared schemas.
function toComponent(schema: any) {
  // Zod v4's native converter emits JSON Schema 2020-12 by default; strip the
  // $schema key since OpenAPI 3.1 documents don't carry it per-component.
  const { $schema: _$schema, ...out } = z.toJSONSchema(schema) as Record<string, unknown>;
  return out;
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

const OK_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
};

const OK_RESPONSE = {
  description: "OK",
  content: { "application/json": { schema: OK_SCHEMA } },
};

const SERIES_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    startDate: { type: "string", format: "date" },
    endDate: { type: "string", format: "date" },
    startTime: { type: "string", description: "HH:MM" },
    endTime: { type: "string", description: "HH:MM" },
    repeatEvery: { type: "number" },
    repeatUnit: { type: "string", enum: ["days", "weeks", "months", "years"] },
    weekDays: {
      type: "array",
      items: { type: "string", enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
      nullable: true,
    },
    monthDay: { type: "number", nullable: true },
    createdAt: { type: "string", format: "date-time" },
  },
  required: ["id", "startDate", "endDate", "startTime", "endTime", "repeatEvery", "repeatUnit"],
};

const SERIES_INPUT_SCHEMA = {
  type: "object",
  properties: {
    startDate: { type: "string", format: "date" },
    endDate: { type: "string", format: "date" },
    startTime: { type: "string", description: "HH:MM" },
    endTime: { type: "string", description: "HH:MM" },
    repeatEvery: { type: "number", default: 1 },
    repeatUnit: { type: "string", enum: ["days", "weeks", "months", "years"], default: "weeks" },
    weekDays: {
      type: "array",
      items: { type: "string", enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
      nullable: true,
    },
    monthDay: { type: "number", nullable: true },
  },
  required: ["startDate", "endDate", "startTime", "endTime"],
};

const REMINDER_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    eventId: { type: "string", format: "uuid" },
    minutesBefore: { type: "number" },
    channel: { type: "string", enum: ["email", "push"] },
    sentAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
  },
  required: ["id", "eventId", "minutesBefore", "channel"],
};

const EVENT_LOG_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    eventId: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    action: { type: "string", enum: ["created", "updated", "deleted"] },
    changes: { type: "object", additionalProperties: true, nullable: true },
    timestamp: { type: "string", format: "date-time" },
  },
  required: ["id", "eventId", "userId", "action", "timestamp"],
};

const ADMIN_SESSION_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    device: { type: "string" },
    ip: { type: "string", nullable: true },
    lastActive: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
    current: { type: "boolean" },
  },
  required: ["id", "device", "lastActive", "expiresAt", "current"],
};

const API_KEY_MASKED_SCHEMA = {
  type: "object",
  description: "API key row without plaintext (plaintext is only returned at creation/rotation)",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", nullable: true },
    start: { type: "string", nullable: true },
    prefix: { type: "string", nullable: true },
    userId: { type: "string", format: "uuid" },
    enabled: { type: "boolean" },
    requestCount: { type: "number" },
    createdAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time", nullable: true },
    lastRequest: { type: "string", format: "date-time", nullable: true },
  },
  required: ["id", "userId", "enabled", "requestCount", "createdAt"],
};

export function getOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "HomeCal API",
      version: "1.0.0",
      description: [
        "Family calendar API. Use `/api/v1/*` paths; `/api/*` (without v1) is deprecated and will be removed — see `docs/api-versioning.md`. Generate a typed client with `openapi-typescript`.",
        "",
        "### Authentication",
        "",
        "Three mechanisms, in order of preference for third-party apps:",
        "",
        "1. **`x-api-key` header** (RECOMMENDED for machine callers) — long-lived, revocable, rate-limited per key. This is what other home apps should use.",
        "2. **Bearer token** — short-lived, issued by `/api/auth/sign-in/email`. Better for interactive sessions.",
        "3. **Session cookie** — browser-flavored, set by Better Auth on login.",
        "",
        "### Third-party onboarding (service-to-service)",
        "",
        'HomeCal uses the **GitHub PAT pattern** — API keys are owned by a "service account" user. To get a key for your app:',
        "",
        '1. Ask a HomeCal admin to open `/admin` → **Services** tab → **Add a service account**. They pick a name (e.g. "Grocery Bot") and role (`user` for most routes, `admin` if you need `/admin/*`).',
        "2. In the drawer they click **Mint key**, pick an expiry (1d / 10d / 1mo / 1yr / custom / never), and hand you the plaintext `hc_...` value **once** — it is never shown again.",
        "3. Store it in your app's env as a secret, send it on every request as `x-api-key: hc_...`.",
        "4. When rotating: admin clicks rotate on an existing key → mints a new one with the same lifespan, old key keeps working during the migration grace window, then admin revokes the old one explicitly.",
        "",
        "Keys inherit their owning service account's role — an admin-scoped key can hit `/admin/*` routes, a user-scoped key cannot. Service accounts are filtered out of `/users` so they never appear as calendar assignees.",
        "",
        "**Self-service alternative**: admin apps can automate the onboarding by calling `POST /admin/service-accounts` followed by `POST /admin/api-keys` with an existing admin credential. See those two endpoints below.",
      ].join("\n"),
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
      { name: "holidays", description: "Read-only national holidays layer (Phase 18)" },
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
          description:
            "Long-lived service key (format `hc_...`) minted by an admin under a **service account** user. Third-party apps should ask a HomeCal admin to create a service account via `POST /admin/service-accounts` and then mint a key via `POST /admin/api-keys` — the plaintext value is returned once and never shown again. The key inherits its owning service account's role. See the auth flow in the API description.",
        },
      },
      schemas: {
        Event: EVENT_SCHEMA,
        User: USER_SCHEMA,
        Series: SERIES_SCHEMA,
        SeriesInput: SERIES_INPUT_SCHEMA,
        Reminder: REMINDER_SCHEMA,
        EventLog: EVENT_LOG_SCHEMA,
        AdminSession: ADMIN_SESSION_SCHEMA,
        ApiKeyMasked: API_KEY_MASKED_SCHEMA,
        Ok: OK_SCHEMA,
        CreateEvent: toComponent(shared.createEventSchema),
        UpdateEvent: toComponent(shared.updateEventSchema),
        EventQuery: toComponent(shared.eventQuerySchema),
        TodayQuery: toComponent(shared.todayQuerySchema),
        ParseEventInput: toComponent(shared.parseEventInputSchema),
        ParseImageInput: toComponent(shared.parseImageInputSchema),
        ImportIcs: toComponent(shared.importIcsSchema),
        ParsedEvent: toComponent(shared.parsedEventSchema),
        CreateReminder: toComponent(shared.createReminderSchema),
        RegisterDevice: toComponent(shared.registerDeviceSchema),
        CreateApiKey: toComponent(shared.createApiKeyInputSchema),
        CreateServiceAccount: toComponent(shared.createServiceAccountSchema),
        HolidaysQuery: toComponent(shared.holidaysQuerySchema),
        UserPreferences: toComponent(shared.userPreferencesSchema),
        Holiday: {
          type: "object",
          properties: {
            date: { type: "string", format: "date" },
            title: { type: "string" },
            countries: { type: "array", items: { type: "string" } },
            type: { type: "string", enum: ["public"] },
          },
          required: ["date", "title", "countries", "type"],
        },
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
            200: {
              description: "Updated event",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Event" } },
              },
            },
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
          responses: { 200: OK_RESPONSE, ...UNAUTHORIZED, ...NOT_FOUND },
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
            200: {
              description: "List of change log entries",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/EventLog" },
                  },
                },
              },
            },
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
          responses: {
            200: {
              description: "Reminder list",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Reminder" } },
                },
              },
            },
            ...UNAUTHORIZED,
            ...NOT_FOUND,
          },
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
          responses: {
            201: {
              description: "Created reminder",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Reminder" } },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
          },
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
          responses: { 200: OK_RESPONSE, ...UNAUTHORIZED, ...NOT_FOUND },
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
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/UpdateEvent" } },
            },
          },
          responses: {
            200: {
              description: "Bulk-update result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean" }, updated: { type: "number" } },
                    required: ["ok", "updated"],
                  },
                },
              },
            },
            ...UNAUTHORIZED,
            ...NOT_FOUND,
          },
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
          responses: {
            200: {
              description: "Bulk-delete result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean" }, deleted: { type: "number" } },
                    required: ["ok", "deleted"],
                  },
                },
              },
            },
            ...UNAUTHORIZED,
            ...NOT_FOUND,
          },
        },
      },
      "/series": {
        post: {
          tags: ["series"],
          summary: "Create a series record",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SeriesInput" } },
            },
          },
          responses: {
            201: {
              description: "Created series",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Series" } },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
          },
        },
      },
      "/series/{id}": {
        get: {
          tags: ["series"],
          summary: "Get a series record",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: {
              description: "Series",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Series" } },
              },
            },
            ...UNAUTHORIZED,
            ...NOT_FOUND,
          },
        },
        put: {
          tags: ["series"],
          summary: "Replace a series config",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SeriesInput" } },
            },
          },
          responses: {
            200: {
              description: "Updated series",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Series" } },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
          },
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
      "/users/me/preferences": {
        get: {
          tags: ["users"],
          summary: "Get the current user's preferences (holiday countries)",
          description:
            "When no preference is stored, derives a default from the request's `Accept-Language` header (without persisting). Empty array means no holidays are rendered.",
          responses: {
            200: {
              description: "Current preferences",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UserPreferences" },
                },
              },
            },
            ...UNAUTHORIZED,
          },
        },
        patch: {
          tags: ["users"],
          summary: "Update the current user's preferences",
          description:
            "Empty array clears the preference so subsequent GETs fall back to the locale-derived default.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/UserPreferences" } },
            },
          },
          responses: {
            200: {
              description: "Updated preferences",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UserPreferences" },
                },
              },
            },
            ...VALIDATION,
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
          responses: { 200: OK_RESPONSE, ...VALIDATION, ...UNAUTHORIZED },
        },
        delete: {
          tags: ["devices"],
          summary: "Unregister a device token",
          responses: { 200: OK_RESPONSE, ...UNAUTHORIZED },
        },
      },
      // ─── Holidays (Phase 18) ──────────────────────────────────────────
      "/holidays": {
        get: {
          tags: ["holidays"],
          summary: "List public holidays for a country list + date range",
          description:
            "Computed on-the-fly from the `date-holidays` package — no DB, no sync. Multi-country (e.g. `countries=US,TW`) merges same-date entries into a single row with both country codes and a `·`-joined title. Public holidays only for v1.",
          parameters: [
            {
              name: "countries",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^[A-Z]{2}(,[A-Z]{2})*$" },
              description: "Comma-separated ISO 3166-1 alpha-2 codes (e.g. `US,TW,GB`).",
            },
            {
              name: "from",
              in: "query",
              required: true,
              schema: { type: "string", format: "date" },
              description: "ISO date — inclusive lower bound.",
            },
            {
              name: "to",
              in: "query",
              required: true,
              schema: { type: "string", format: "date" },
              description: "ISO date — inclusive upper bound.",
            },
          ],
          responses: {
            200: {
              description: "Deduped, sorted holiday list",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Holiday" } },
                },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
          },
        },
      },
      "/holidays/countries": {
        get: {
          tags: ["holidays"],
          summary: "List supported ISO 3166-1 alpha-2 country codes + names",
          description:
            "Used by the settings UI to render the holiday country multi-select. Sorted alphabetically by name. ~200 entries.",
          responses: {
            200: {
              description: "Country list",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string" },
                        name: { type: "string" },
                      },
                      required: ["code", "name"],
                    },
                  },
                },
              },
            },
            ...UNAUTHORIZED,
          },
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
            200: {
              description: "Session list",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/AdminSession" } },
                },
              },
            },
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
            200: {
              description: "Revoke result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean" }, revoked: { type: "number" } },
                    required: ["ok", "revoked"],
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
            200: OK_RESPONSE,
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
          responses: {
            200: {
              description: "Masked key list — never includes plaintext",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/ApiKeyMasked" } },
                },
              },
            },
            ...UNAUTHORIZED,
            ...FORBIDDEN,
          },
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
            200: OK_RESPONSE,
            ...UNAUTHORIZED,
            ...FORBIDDEN,
            ...NOT_FOUND,
          },
        },
      },
      "/admin/api-keys/{id}/rotate": {
        post: {
          tags: ["admin"],
          summary: "Rotate an API key (mint new with same name + userId, preserves lifespan)",
          description:
            "Mints a fresh key for the same user + name and returns plaintext **once**. The original key is NOT deleted — the admin is expected to migrate the caller then revoke the predecessor explicitly. Never-expiring keys rotate into never-expiring; keys with an `expiresAt` rotate into a new key with the same total duration starting now.",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: {
              description: "Rotated — new plaintext key (returned once) plus `rotatedFromId`",
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
                      rotatedFromId: { type: "string", format: "uuid" },
                    },
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
      "/admin/service-accounts": {
        get: {
          tags: ["admin"],
          summary: "List service accounts with their API keys",
          description:
            "Returns every user where `isService = true`, each shaped as `{ user, keys }`. Single roundtrip — the keys are grouped per service so the UI doesn't need N+1 fetches.",
          responses: {
            200: {
              description: "Service accounts + keys",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        user: {
                          type: "object",
                          properties: {
                            id: { type: "string", format: "uuid" },
                            name: { type: "string" },
                            role: { type: "string" },
                            banned: { type: "boolean", nullable: true },
                            color: { type: "string" },
                            createdAt: { type: "string", format: "date-time" },
                          },
                        },
                        keys: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string", format: "uuid" },
                              name: { type: "string", nullable: true },
                              prefix: { type: "string", nullable: true },
                              start: { type: "string", nullable: true },
                              userId: { type: "string", format: "uuid" },
                              enabled: { type: "boolean" },
                              requestCount: { type: "number" },
                              lastRequest: {
                                type: "string",
                                format: "date-time",
                                nullable: true,
                              },
                              createdAt: { type: "string", format: "date-time" },
                              expiresAt: {
                                type: "string",
                                format: "date-time",
                                nullable: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...UNAUTHORIZED,
            ...FORBIDDEN,
          },
        },
        post: {
          tags: ["admin"],
          summary: "Create a service account (machine caller user)",
          description:
            "Creates a user with `isService = true` backed by a throwaway random password (never returned — the real credential is an API key minted under this user via `POST /admin/api-keys`). See `docs/lessons.md` for the GitHub PAT mental model.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateServiceAccount" },
              },
            },
          },
          responses: {
            200: {
              description: "Created service account user",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                      email: { type: "string" },
                      role: { type: "string" },
                      color: { type: "string" },
                      isService: { type: "boolean" },
                      createdAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            ...VALIDATION,
            ...UNAUTHORIZED,
            ...FORBIDDEN,
          },
        },
      },
    },
  };
}
