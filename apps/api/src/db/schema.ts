import { relations } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  color: text().notNull(),
  passwordHash: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
