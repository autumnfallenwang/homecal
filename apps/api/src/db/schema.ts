import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  color: text().notNull(),
  role: text().notNull().default("user"),
  banned: boolean().default(false),
  banReason: text(),
  banExpires: timestamp({ withTimezone: true }),
  // Phase 17: distinguishes "service accounts" (other apps calling HomeCal
  // via API key) from real family members. Service accounts never appear in
  // /api/users (the calendar member filter) and have a different UI surface
  // under /admin?tab=services.
  isService: boolean().notNull().default(false),
  // Phase 18 task 81: per-user holiday country preference. Null means "not
  // set yet" — the API derives a default from the request's accept-language
  // header and returns it transiently; the value is only persisted on PATCH.
  holidayCountries: text().array(),
  // Phase 21: whether this member receives the daily digest email. A plain
  // column (like holidayCountries) managed by the admin /api/admin/digest route,
  // not a Better Auth additionalField. Defaults on — the digest itself is off
  // until an admin enables it, so auto-subscribing new members is harmless.
  receivesDailyDigest: boolean().notNull().default(true),
  // Phase 23: whether this member gets household-device alerts (a device went
  // offline / came back, a wake-up didn't ring). The migration backfills admins
  // to true; everyone else opts in from the Devices tab.
  receivesDeviceAlerts: boolean().notNull().default(false),
  // Phase 26: how this member receives their event reminders. An email row
  // emails only members with "email" here, a push row pushes only to "push";
  // with "speaker", every reminder of their events also plays on the speakers
  // that serve them. The default keeps today's behaviour (email + push).
  reminderDelivery: text().array().notNull().default(["email", "push"]),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ipAddress: text(),
  userAgent: text(),
  impersonatedBy: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text().notNull(),
  providerId: text().notNull(),
  accessToken: text(),
  refreshToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  idToken: text(),
  password: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: uuid().primaryKey().defaultRandom(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const series = pgTable("series", {
  id: uuid().primaryKey().defaultRandom(),
  startDate: text().notNull(),
  endDate: text().notNull(),
  startTime: text().notNull(),
  endTime: text().notNull(),
  repeatEvery: integer().notNull().default(1),
  repeatUnit: text().notNull().default("weeks"),
  weekDays: text(),
  monthDay: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    location: text(),
    description: text(),
    start: timestamp({ withTimezone: true }).notNull(),
    end: timestamp({ withTimezone: true }).notNull(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    private: boolean().notNull().default(false),
    seriesId: uuid().references(() => series.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_owner_id_idx").on(table.ownerId),
    index("events_start_idx").on(table.start),
    index("events_series_id_idx").on(table.seriesId),
  ],
);

export const eventLogs = pgTable(
  "event_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text().notNull(),
    changes: jsonb(),
    timestamp: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("event_logs_event_id_idx").on(table.eventId)],
);

export const eventAssignees = pgTable(
  "event_assignees",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("event_assignees_event_id_idx").on(table.eventId),
    index("event_assignees_user_id_idx").on(table.userId),
    unique("event_assignees_event_user_unique").on(table.eventId, table.userId),
  ],
);

export const eventReminders = pgTable(
  "event_reminders",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    minutesBefore: integer().notNull(),
    channel: text().notNull().default("email"),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("event_reminders_event_id_idx").on(table.eventId),
    unique("event_reminders_event_minutes_channel_unique").on(
      table.eventId,
      table.minutesBefore,
      table.channel,
    ),
  ],
);

export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text().notNull(),
    token: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("device_tokens_user_id_idx").on(table.userId),
    unique("device_tokens_user_token_unique").on(table.userId, table.token),
  ],
);

// Better Auth apiKey plugin table. With `usePlural: true` in our adapter
// config, BA looks for `schema.apikeys` (plural). Both the Drizzle export
// and the SQL table name use the plural form.
export const apikeys = pgTable("apikeys", {
  id: uuid().primaryKey().defaultRandom(),
  name: text(),
  start: text(),
  prefix: text(),
  key: text().notNull(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  refillInterval: integer(),
  refillAmount: integer(),
  lastRefillAt: timestamp({ withTimezone: true }),
  enabled: boolean().notNull().default(true),
  rateLimitEnabled: boolean().notNull().default(true),
  rateLimitTimeWindow: integer(),
  rateLimitMax: integer(),
  requestCount: integer().notNull().default(0),
  remaining: integer(),
  lastRequest: timestamp({ withTimezone: true }),
  expiresAt: timestamp({ withTimezone: true }),
  permissions: text(),
  metadata: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Phase 21 — admin-configured daily digest. Single-row (family-level) config:
// the `singleton` unique constraint guarantees at most one row. Recipients are
// tracked per-user via users.receivesDailyDigest; lastSentOn is the once-per-day
// dedup marker (a local YYYY-MM-DD in `timezone`).
export const digestSettings = pgTable(
  "digest_settings",
  {
    id: uuid().primaryKey().defaultRandom(),
    singleton: boolean().notNull().default(true),
    enabled: boolean().notNull().default(false),
    sendAt: text().notNull().default("07:00"),
    timezone: text().notNull().default("America/New_York"),
    lastSentOn: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("digest_settings_singleton_unique").on(table.singleton)],
);

// Phase 23 — household output devices: the Kindle wall display ("display") and
// speaker phones ("speaker"). Distinct from device_tokens (iOS push tokens).
// Each device authenticates with its own hc_ key; `apikeyId` links it, and a
// request made with that key is a check-in. Status (online/stale/offline) is
// computed from lastSeenAt on read; offlineAlertedAt de-duplicates alerts.
export const householdDevices = pgTable(
  "household_devices",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(),
    name: text().notNull(),
    room: text(),
    apikeyId: uuid().references(() => apikeys.id, { onDelete: "set null" }),
    settings: jsonb().notNull().default({}),
    offlineAfterMinutes: integer().notNull(),
    alertsEnabled: boolean().notNull().default(true),
    lastSeenAt: timestamp({ withTimezone: true }),
    lastStatus: jsonb(),
    offlineAlertedAt: timestamp({ withTimezone: true }),
    // Phase 24: while an admin has this speaker open, it polls every 15 s
    // instead of 60 s, so a Say now typed there arrives quickly.
    attentionUntil: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("household_devices_apikey_unique").on(table.apikeyId)],
);

// Which members a device serves. Routines and reminders addressed to a member
// reach the devices serving them; for a display it filters whose events show
// (no rows = everyone).
export const householdDeviceMembers = pgTable(
  "household_device_members",
  {
    id: uuid().primaryKey().defaultRandom(),
    deviceId: uuid()
      .notNull()
      .references(() => householdDevices.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("household_device_members_user_id_idx").on(table.userId),
    unique("household_device_members_device_user_unique").on(table.deviceId, table.userId),
  ],
);

// Phase 24 — one-off messages for a speaker: Say now, Test sound, and the
// announce API (Phase 26). Delivered in the speaker's desired state until it
// reports them played or they expire (2 min), so an offline speaker never plays
// a stale message later.
export const deviceAnnouncements = pgTable(
  "device_announcements",
  {
    id: uuid().primaryKey().defaultRandom(),
    deviceId: uuid()
      .notNull()
      .references(() => householdDevices.id, { onDelete: "cascade" }),
    text: text().notNull(),
    sound: text().notNull().default("chime"),
    source: text().notNull(),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    playedAt: timestamp({ withTimezone: true }),
    playOk: boolean(),
    playError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("device_announcements_device_id_idx").on(table.deviceId)],
);

// Phase 26 — speakers picked for a speaker-channel event reminder. No rows =
// the speakers serving the event's assignees.
export const eventReminderDevices = pgTable(
  "event_reminder_devices",
  {
    id: uuid().primaryKey().defaultRandom(),
    reminderId: uuid()
      .notNull()
      .references(() => eventReminders.id, { onDelete: "cascade" }),
    deviceId: uuid()
      .notNull()
      .references(() => householdDevices.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("event_reminder_devices_reminder_device_unique").on(table.reminderId, table.deviceId),
  ],
);

// Phase 25 — routines: a daily repeating sound for one member (wake-up,
// bedtime), held by the speakers that serve that member. Not calendar events:
// they never appear in event lists, the digest, /dash or ICS. `weekDays` uses
// a comma list like series ("1,2,3,4,5"), but 0 = Sunday, not Monday; `time` is local HH:MM in the
// household timezone; `pausedUntil` is the last paused local date (inclusive).
export const routines = pgTable(
  "routines",
  {
    id: uuid().primaryKey().defaultRandom(),
    memberId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    message: text().notNull().default(""),
    time: text().notNull(),
    weekDays: text().notNull(),
    sound: text().notNull().default("beeps"),
    enabled: boolean().notNull().default(true),
    skipHolidays: boolean().notNull().default(true),
    includeBriefing: boolean().notNull().default(true),
    pausedUntil: text(),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("routines_member_id_idx").on(table.memberId)],
);

// One-off skipped dates ("skip tomorrow"), local YYYY-MM-DD.
export const routineSkips = pgTable(
  "routine_skips",
  {
    id: uuid().primaryKey().defaultRandom(),
    routineId: uuid()
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    date: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("routine_skips_routine_date_unique").on(table.routineId, table.date)],
);

// What happened to each occurrence on each speaker: rang (ok or not), and which
// alerts went out (offline 30 min before, missed after). One row per
// (routine, device, local date), created by a rang report or by an alert.
export const routineRuns = pgTable(
  "routine_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    routineId: uuid()
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    deviceId: uuid()
      .notNull()
      .references(() => householdDevices.id, { onDelete: "cascade" }),
    occurrenceDate: text().notNull(),
    scheduledAt: timestamp({ withTimezone: true }).notNull(),
    rangAt: timestamp({ withTimezone: true }),
    ok: boolean(),
    error: text(),
    offlineWarnedAt: timestamp({ withTimezone: true }),
    missedAlertedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("routine_runs_routine_device_date_unique").on(
      table.routineId,
      table.deviceId,
      table.occurrenceDate,
    ),
  ],
);

// Relations for Drizzle relational query builder

export const usersRelations = relations(users, ({ many }) => ({
  events: many(events),
  eventLogs: many(eventLogs),
  eventAssignees: many(eventAssignees),
  deviceTokens: many(deviceTokens),
  sessions: many(sessions),
  accounts: many(accounts),
  apikeyss: many(apikeys),
}));

export const apikeysRelations = relations(apikeys, ({ one }) => ({
  user: one(users, { fields: [apikeys.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const seriesRelations = relations(series, ({ many }) => ({
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  owner: one(users, { fields: [events.ownerId], references: [users.id] }),
  seriesRef: one(series, { fields: [events.seriesId], references: [series.id] }),
  logs: many(eventLogs),
  assignees: many(eventAssignees),
  reminders: many(eventReminders),
}));

export const eventLogsRelations = relations(eventLogs, ({ one }) => ({
  event: one(events, {
    fields: [eventLogs.eventId],
    references: [events.id],
  }),
  user: one(users, { fields: [eventLogs.userId], references: [users.id] }),
}));

export const eventAssigneesRelations = relations(eventAssignees, ({ one }) => ({
  event: one(events, { fields: [eventAssignees.eventId], references: [events.id] }),
  user: one(users, { fields: [eventAssignees.userId], references: [users.id] }),
}));

export const eventRemindersRelations = relations(eventReminders, ({ one }) => ({
  event: one(events, { fields: [eventReminders.eventId], references: [events.id] }),
}));

export const deviceTokensRelations = relations(deviceTokens, ({ one }) => ({
  user: one(users, { fields: [deviceTokens.userId], references: [users.id] }),
}));

export const householdDevicesRelations = relations(householdDevices, ({ one, many }) => ({
  apikey: one(apikeys, { fields: [householdDevices.apikeyId], references: [apikeys.id] }),
  members: many(householdDeviceMembers),
}));

export const householdDeviceMembersRelations = relations(householdDeviceMembers, ({ one }) => ({
  device: one(householdDevices, {
    fields: [householdDeviceMembers.deviceId],
    references: [householdDevices.id],
  }),
  user: one(users, { fields: [householdDeviceMembers.userId], references: [users.id] }),
}));
