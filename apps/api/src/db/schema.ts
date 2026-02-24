import { relations } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const events = pgTable(
  "events",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    start: timestamp({ withTimezone: true }).notNull(),
    end: timestamp({ withTimezone: true }).notNull(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    private: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_owner_id_idx").on(table.ownerId),
    index("events_start_idx").on(table.start),
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

// Relations for Drizzle relational query builder

export const usersRelations = relations(users, ({ many }) => ({
  events: many(events),
  eventLogs: many(eventLogs),
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  owner: one(users, { fields: [events.ownerId], references: [users.id] }),
  logs: many(eventLogs),
}));

export const eventLogsRelations = relations(eventLogs, ({ one }) => ({
  event: one(events, {
    fields: [eventLogs.eventId],
    references: [events.id],
  }),
  user: one(users, { fields: [eventLogs.userId], references: [users.id] }),
}));
