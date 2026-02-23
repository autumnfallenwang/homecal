import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { eventLogs, events, users } from "../../src/db/schema.js";

describe("schema", () => {
  describe("table names", () => {
    it("uses correct table names", () => {
      expect(getTableName(users)).toBe("users");
      expect(getTableName(events)).toBe("events");
      expect(getTableName(eventLogs)).toBe("event_logs");
    });
  });

  describe("users table", () => {
    const columns = getTableColumns(users);

    it("has all required columns", () => {
      expect(Object.keys(columns)).toEqual(
        expect.arrayContaining(["id", "name", "color", "passwordHash", "createdAt"]),
      );
    });

    it("has uuid primary key with default", () => {
      expect(columns.id.dataType).toBe("string");
      expect(columns.id.hasDefault).toBe(true);
    });
  });

  describe("events table", () => {
    const columns = getTableColumns(events);

    it("has all required columns", () => {
      expect(Object.keys(columns)).toEqual(
        expect.arrayContaining([
          "id",
          "title",
          "start",
          "end",
          "ownerId",
          "private",
          "createdAt",
          "updatedAt",
        ]),
      );
    });

    it("has uuid primary key with default", () => {
      expect(columns.id.dataType).toBe("string");
      expect(columns.id.hasDefault).toBe(true);
    });

    it("defaults private to false", () => {
      expect(columns.private.hasDefault).toBe(true);
    });
  });

  describe("eventLogs table", () => {
    const columns = getTableColumns(eventLogs);

    it("has all required columns", () => {
      expect(Object.keys(columns)).toEqual(
        expect.arrayContaining(["id", "eventId", "userId", "action", "changes", "timestamp"]),
      );
    });

    it("has uuid primary key with default", () => {
      expect(columns.id.dataType).toBe("string");
      expect(columns.id.hasDefault).toBe(true);
    });

    it("has nullable changes column", () => {
      expect(columns.changes.notNull).toBe(false);
    });
  });
});
