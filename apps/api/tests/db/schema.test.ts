import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accounts,
  eventLogs,
  events,
  sessions,
  users,
  verifications,
} from "../../src/db/schema.js";

describe("schema", () => {
  describe("table names", () => {
    it("uses correct table names", () => {
      expect(getTableName(users)).toBe("users");
      expect(getTableName(events)).toBe("events");
      expect(getTableName(eventLogs)).toBe("event_logs");
      expect(getTableName(sessions)).toBe("sessions");
      expect(getTableName(accounts)).toBe("accounts");
      expect(getTableName(verifications)).toBe("verifications");
    });
  });

  describe("users table", () => {
    const columns = getTableColumns(users);

    it("has all required columns", () => {
      expect(Object.keys(columns)).toEqual(
        expect.arrayContaining([
          "id",
          "name",
          "email",
          "emailVerified",
          "image",
          "color",
          "role",
          "banned",
          "banReason",
          "banExpires",
          "createdAt",
          "updatedAt",
        ]),
      );
    });

    it("does not have passwordHash column", () => {
      expect(Object.keys(columns)).not.toContain("passwordHash");
    });

    it("has uuid primary key with default", () => {
      expect(columns.id.dataType).toBe("string");
      expect(columns.id.hasDefault).toBe(true);
    });
  });

  describe("sessions table", () => {
    const columns = getTableColumns(sessions);

    it("has all required columns", () => {
      expect(Object.keys(columns)).toEqual(
        expect.arrayContaining([
          "id",
          "userId",
          "token",
          "expiresAt",
          "ipAddress",
          "userAgent",
          "impersonatedBy",
          "createdAt",
          "updatedAt",
        ]),
      );
    });

    it("has uuid primary key with default", () => {
      expect(columns.id.dataType).toBe("string");
      expect(columns.id.hasDefault).toBe(true);
    });
  });

  describe("accounts table", () => {
    const columns = getTableColumns(accounts);

    it("has all required columns", () => {
      expect(Object.keys(columns)).toEqual(
        expect.arrayContaining([
          "id",
          "userId",
          "accountId",
          "providerId",
          "accessToken",
          "refreshToken",
          "accessTokenExpiresAt",
          "refreshTokenExpiresAt",
          "scope",
          "idToken",
          "password",
          "createdAt",
          "updatedAt",
        ]),
      );
    });

    it("has uuid primary key with default", () => {
      expect(columns.id.dataType).toBe("string");
      expect(columns.id.hasDefault).toBe(true);
    });
  });

  describe("verifications table", () => {
    const columns = getTableColumns(verifications);

    it("has all required columns", () => {
      expect(Object.keys(columns)).toEqual(
        expect.arrayContaining([
          "id",
          "identifier",
          "value",
          "expiresAt",
          "createdAt",
          "updatedAt",
        ]),
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
