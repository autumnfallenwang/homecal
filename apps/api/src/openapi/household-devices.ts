/* biome-ignore-all lint/style/useNamingConvention: OpenAPI spec keys are canonical (requestBody, etc.) */
import * as shared from "@homecal/shared";
import { z } from "zod";

/**
 * OpenAPI paths for Phases 23–26 (household devices, speaker sync, routines,
 * speaker reminders + announce API), merged into the main spec in spec.ts.
 */

// biome-ignore lint/suspicious/noExplicitAny: Zod v4's toJSONSchema types are schema-instance-specific.
function toComponent(schema: any) {
  const { $schema: _$schema, ...out } = z.toJSONSchema(schema, { io: "input" }) as Record<
    string,
    unknown
  >;
  return out;
}

const err = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { error: { type: "string" }, code: { type: "string" } },
        required: ["error"],
      },
    },
  },
});
const UNAUTH = { 401: err("Unauthorized") };
const FORBIDDEN = { 403: err("Forbidden") };
const NOT_FOUND = { 404: err("Not found") };
const VALIDATION = { 400: err("Validation failed") };
const json = (ref: string, description = "OK") => ({
  description,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});
const body = (ref: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});
const idParam = (name = "id") => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
});

const DEVICE_VIEW = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    kind: { type: "string", enum: ["display", "speaker"] },
    name: { type: "string" },
    room: { type: "string", nullable: true },
    memberIds: { type: "array", items: { type: "string", format: "uuid" } },
    settings: { type: "object", description: "DisplaySettings or SpeakerSettings, by kind" },
    offlineAfterMinutes: { type: "integer" },
    alertsEnabled: { type: "boolean" },
    lastSeenAt: { type: "string", format: "date-time", nullable: true },
    status: { type: "string", enum: ["never", "online", "stale", "offline"] },
    lastStatus: { type: "object", nullable: true, description: "Last speaker report" },
    key: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string", format: "uuid" },
        start: { type: "string", nullable: true },
        prefix: { type: "string", nullable: true },
        ownedByDevices: { type: "boolean" },
      },
    },
  },
};

const DESIRED_STATE = {
  type: "object",
  description:
    "What a speaker should hold: settings with concrete quiet windows, the agent release to run, sounds, the next 7 days of scheduled items (UTC instants), pending announcements, and the rang ids acknowledged.",
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    deviceId: { type: "string", format: "uuid" },
    name: { type: "string" },
    serverTime: { type: "string", format: "date-time" },
    nextPollAfterMs: {
      type: "integer",
      description: "60000 idle, 15000 while watched, 5000 after Say now",
    },
    settings: { type: "object" },
    agent: { type: "object", nullable: true },
    sounds: { type: "array", items: { type: "object" } },
    schedule: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["routine", "reminder"] },
          at: { type: "string", format: "date-time" },
          sound: { type: "string", enum: ["beeps", "chime", "none"] },
          text: { type: "string" },
        },
      },
    },
    announcements: { type: "array", items: { type: "object" } },
    ack: { type: "array", items: { type: "string" } },
  },
};

export const householdDeviceSchemas = {
  HouseholdDevice: DEVICE_VIEW,
  CreateDevice: toComponent(shared.createDeviceSchema),
  UpdateDevice: toComponent(shared.updateDeviceSchema),
  DeviceAlertRecipients: toComponent(shared.updateDeviceAlertRecipientsSchema),
  Announce: toComponent(shared.announceSchema),
  AgentSyncReport: toComponent(shared.agentSyncReportSchema),
  DesiredState: DESIRED_STATE,
  CreateRoutine: toComponent(shared.createRoutineSchema),
  UpdateRoutine: toComponent(shared.updateRoutineSchema),
  SpeakerAnnounce: toComponent(shared.speakerAnnounceSchema),
  ReminderDelivery: toComponent(shared.updateReminderDeliverySchema),
};

export const householdDeviceTags = [
  { name: "household-devices", description: "Kindle displays and speaker phones (Phases 23–24)" },
  { name: "agent", description: "Calls made by speakers with their device key (Phase 24)" },
  { name: "routines", description: "Wake-ups and other daily routines on speakers (Phase 25)" },
  { name: "speaker", description: "Announcements to speakers from other home apps (Phase 26)" },
];

const dev = ["household-devices"];

export const householdDevicePaths = {
  "/admin/devices": {
    get: {
      tags: dev,
      summary: "List devices and alert recipients",
      responses: { 200: { description: "Devices + alertRecipientIds" }, ...UNAUTH, ...FORBIDDEN },
    },
    post: {
      tags: dev,
      summary: "Register a device; mints its key (shown once) unless adopting an existing one",
      requestBody: body("CreateDevice"),
      responses: {
        201: { description: "{ device, key }" },
        ...VALIDATION,
        ...UNAUTH,
        ...FORBIDDEN,
        409: err("Key already belongs to a device"),
      },
    },
  },
  "/admin/devices/adoptable-keys": {
    get: {
      tags: dev,
      summary: "Service-account keys not linked to a device",
      responses: { 200: { description: "Keys" }, ...UNAUTH, ...FORBIDDEN },
    },
  },
  "/admin/devices/agent-releases": {
    get: {
      tags: dev,
      summary: "Speaker agent versions bundled in this server",
      responses: { 200: { description: "[{ version, sha256 }]" }, ...UNAUTH, ...FORBIDDEN },
    },
  },
  "/admin/devices/alerts": {
    patch: {
      tags: dev,
      summary: "Set who receives device alerts (email)",
      requestBody: body("DeviceAlertRecipients"),
      responses: {
        200: { description: "alertRecipientIds" },
        ...VALIDATION,
        ...UNAUTH,
        ...FORBIDDEN,
      },
    },
  },
  "/admin/devices/{id}": {
    get: {
      tags: dev,
      summary: "Get a device",
      parameters: [idParam()],
      responses: { 200: json("HouseholdDevice"), ...UNAUTH, ...FORBIDDEN, ...NOT_FOUND },
    },
    patch: {
      tags: dev,
      summary: "Update name, room, members, thresholds or settings",
      parameters: [idParam()],
      requestBody: body("UpdateDevice"),
      responses: {
        200: json("HouseholdDevice"),
        ...VALIDATION,
        ...UNAUTH,
        ...FORBIDDEN,
        ...NOT_FOUND,
      },
    },
    delete: {
      tags: dev,
      summary: "Delete a device and revoke its key",
      parameters: [idParam()],
      responses: { 200: { description: "ok" }, ...UNAUTH, ...FORBIDDEN, ...NOT_FOUND },
    },
  },
  "/admin/devices/{id}/rotate-key": {
    post: {
      tags: dev,
      summary: "Replace the device's key (old key stops immediately; new key returned once)",
      parameters: [idParam()],
      responses: { 200: { description: "{ device, key }" }, ...UNAUTH, ...FORBIDDEN, ...NOT_FOUND },
    },
  },
  "/admin/devices/{id}/key": {
    delete: {
      tags: dev,
      summary: "Revoke the device's key",
      parameters: [idParam()],
      responses: { 200: json("HouseholdDevice"), ...UNAUTH, ...FORBIDDEN, ...NOT_FOUND },
    },
  },
  "/admin/devices/{id}/announce": {
    post: {
      tags: dev,
      summary: "Say now / Test sound on a speaker (refused in quiet hours)",
      parameters: [idParam()],
      requestBody: body("Announce"),
      responses: {
        201: { description: "{ id, expiresAt }" },
        ...VALIDATION,
        ...UNAUTH,
        ...FORBIDDEN,
        ...NOT_FOUND,
        409: err("QUIET_HOURS"),
      },
    },
  },
  "/admin/devices/{id}/attention": {
    post: {
      tags: dev,
      summary: "Poll this speaker every 15 s for the next 2 minutes",
      parameters: [idParam()],
      responses: { 200: { description: "attentionUntil" }, ...UNAUTH, ...FORBIDDEN, ...NOT_FOUND },
    },
  },
  "/agent/sync": {
    post: {
      tags: ["agent"],
      summary: "Speaker sync: report in, desired state out (device key in x-api-key)",
      security: [{ apiKeyAuth: [] }],
      requestBody: body("AgentSyncReport"),
      responses: {
        200: json("DesiredState"),
        ...VALIDATION,
        ...UNAUTH,
        403: err("NOT_A_DEVICE / NOT_A_SPEAKER"),
      },
    },
  },
  "/agent/releases/{version}": {
    get: {
      tags: ["agent"],
      summary: "Download a speaker agent release (checked against the sha256 in the desired state)",
      security: [{ apiKeyAuth: [] }],
      parameters: [{ name: "version", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Python source" }, ...UNAUTH, ...NOT_FOUND },
    },
  },
  "/agent/sounds/{name}": {
    get: {
      tags: ["agent"],
      summary: "Download a built-in sound",
      security: [{ apiKeyAuth: [] }],
      parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "audio/wav" }, ...UNAUTH, ...NOT_FOUND },
    },
  },
  "/admin/routines": {
    get: {
      tags: ["routines"],
      summary: "List routines with next occurrence, last result and speakers",
      responses: { 200: { description: "Routines" }, ...UNAUTH, ...FORBIDDEN },
    },
    post: {
      tags: ["routines"],
      summary: "Create a routine for a member",
      requestBody: body("CreateRoutine"),
      responses: { 201: { description: "Routine" }, ...VALIDATION, ...UNAUTH, ...FORBIDDEN },
    },
  },
  "/admin/routines/{id}": {
    patch: {
      tags: ["routines"],
      summary: "Update a routine",
      parameters: [idParam()],
      requestBody: body("UpdateRoutine"),
      responses: {
        200: { description: "Routine" },
        ...VALIDATION,
        ...UNAUTH,
        ...FORBIDDEN,
        ...NOT_FOUND,
      },
    },
    delete: {
      tags: ["routines"],
      summary: "Delete a routine",
      parameters: [idParam()],
      responses: { 200: { description: "ok" }, ...UNAUTH, ...FORBIDDEN, ...NOT_FOUND },
    },
  },
  "/admin/routines/{id}/skip": {
    post: {
      tags: ["routines"],
      summary: "Skip one date (default: the next occurrence)",
      parameters: [idParam()],
      responses: {
        200: { description: "Routine" },
        ...UNAUTH,
        ...FORBIDDEN,
        ...NOT_FOUND,
        409: err("No upcoming occurrence"),
      },
    },
  },
  "/admin/routines/{id}/skip/{date}": {
    delete: {
      tags: ["routines"],
      summary: "Undo a skip",
      parameters: [
        idParam(),
        { name: "date", in: "path", required: true, schema: { type: "string", format: "date" } },
      ],
      responses: { 200: { description: "Routine" }, ...UNAUTH, ...FORBIDDEN, ...NOT_FOUND },
    },
  },
  "/admin/reminder-delivery": {
    get: {
      tags: ["admin"],
      summary: "Every member's reminder delivery channels",
      responses: {
        200: { description: "[{ userId, reminderDelivery }]" },
        ...UNAUTH,
        ...FORBIDDEN,
      },
    },
  },
  "/admin/users/{id}/reminder-delivery": {
    patch: {
      tags: ["admin"],
      summary: "Set how a member receives event reminders (email, push, speaker)",
      parameters: [idParam()],
      requestBody: body("ReminderDelivery"),
      responses: {
        200: { description: "{ userId, reminderDelivery }" },
        ...VALIDATION,
        ...UNAUTH,
        ...FORBIDDEN,
        ...NOT_FOUND,
      },
    },
  },
  "/speaker/speakers": {
    get: {
      tags: ["speaker"],
      summary: "Speakers a member can pick for an event reminder (id, name, room)",
      responses: { 200: { description: "Speakers" }, ...UNAUTH },
    },
  },
  "/speaker/announce": {
    post: {
      tags: ["speaker"],
      summary: "Announce on speakers (admins and service accounts; 10/min per caller)",
      description:
        "Targets the given speakers and/or the speakers serving the given members. Speakers in quiet hours are skipped; if every target is quiet the call is refused with QUIET_HOURS.",
      requestBody: body("SpeakerAnnounce"),
      responses: {
        201: { description: "{ queued: [{ deviceId, announcementId }], quiet: [deviceId] }" },
        ...VALIDATION,
        ...UNAUTH,
        ...FORBIDDEN,
        409: err("NO_SPEAKER / QUIET_HOURS"),
        429: err("RATE_LIMITED"),
      },
    },
  },
};
