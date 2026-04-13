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
