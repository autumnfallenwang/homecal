import { todayQuerySchema } from "@homecal/shared";
import { describe, expect, it } from "vitest";
import {
  computeLocalDayWindows,
  eventOverlapsWindow,
  getLocalParts,
  zonedMidnightToUtc,
} from "../../src/services/today.js";

describe("todayQuerySchema", () => {
  it("accepts a valid IANA zone", () => {
    expect(todayQuerySchema.safeParse({ tz: "America/Los_Angeles" }).success).toBe(true);
    expect(todayQuerySchema.safeParse({ tz: "UTC" }).success).toBe(true);
    expect(todayQuerySchema.safeParse({ tz: "Asia/Shanghai" }).success).toBe(true);
    expect(todayQuerySchema.safeParse({ tz: "Etc/GMT+12" }).success).toBe(true);
  });

  it("accepts an optional comma-separated userIds string", () => {
    const r = todayQuerySchema.safeParse({ tz: "UTC", userIds: "a,b,c" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.userIds).toBe("a,b,c");
    }
  });

  it("rejects missing tz", () => {
    expect(todayQuerySchema.safeParse({}).success).toBe(false);
  });

  it("rejects malformed tz strings", () => {
    expect(todayQuerySchema.safeParse({ tz: "not a zone!" }).success).toBe(false);
    expect(todayQuerySchema.safeParse({ tz: "<script>" }).success).toBe(false);
    expect(todayQuerySchema.safeParse({ tz: "" }).success).toBe(false);
  });

  it("rejects tz strings longer than 64 chars", () => {
    expect(todayQuerySchema.safeParse({ tz: "A".repeat(65) }).success).toBe(false);
  });
});

describe("getLocalParts", () => {
  it("extracts local wall-clock parts for UTC", () => {
    const parts = getLocalParts(new Date("2026-04-12T15:30:45Z"), "UTC");
    expect(parts.year).toBe("2026");
    expect(parts.month).toBe("04");
    expect(parts.day).toBe("12");
    expect(parts.hour).toBe("15");
    expect(parts.minute).toBe("30");
    expect(parts.second).toBe("45");
  });

  it("shifts into America/Los_Angeles (PDT = UTC-7)", () => {
    // 2026-04-12 is PDT (April, after DST start)
    const parts = getLocalParts(new Date("2026-04-12T15:00:00Z"), "America/Los_Angeles");
    expect(parts.year).toBe("2026");
    expect(parts.month).toBe("04");
    expect(parts.day).toBe("12");
    expect(parts.hour).toBe("08");
  });

  it("shifts into Asia/Shanghai (UTC+8)", () => {
    const parts = getLocalParts(new Date("2026-04-12T15:00:00Z"), "Asia/Shanghai");
    expect(parts.day).toBe("12");
    expect(parts.hour).toBe("23");
  });

  it("handles day rollover across the dateline", () => {
    // 2026-04-12 00:00 UTC = 2026-04-12 14:00 local in Kiritimati (+14)
    const parts = getLocalParts(new Date("2026-04-12T00:00:00Z"), "Pacific/Kiritimati");
    expect(parts.day).toBe("12");
    expect(parts.hour).toBe("14");
  });

  it("throws on an invalid timezone", () => {
    expect(() => getLocalParts(new Date(), "Not/AZone")).toThrow();
  });
});

describe("zonedMidnightToUtc", () => {
  it("returns the same instant for UTC midnight", () => {
    const d = zonedMidnightToUtc("2026-04-12", "UTC");
    expect(d.toISOString()).toBe("2026-04-12T00:00:00.000Z");
  });

  it("returns 07:00Z for PDT midnight", () => {
    // April 12 is PDT (UTC-7)
    const d = zonedMidnightToUtc("2026-04-12", "America/Los_Angeles");
    expect(d.toISOString()).toBe("2026-04-12T07:00:00.000Z");
  });

  it("returns 16:00Z for Asia/Shanghai midnight", () => {
    // Shanghai is UTC+8 → local midnight = previous day 16:00Z
    const d = zonedMidnightToUtc("2026-04-12", "Asia/Shanghai");
    expect(d.toISOString()).toBe("2026-04-11T16:00:00.000Z");
  });

  it("handles DST spring-forward boundary (Los Angeles, 2026-03-08)", () => {
    // March 8 2026: PST → PDT at 02:00 local; midnight is still PST (UTC-8) → 08:00Z
    const d = zonedMidnightToUtc("2026-03-08", "America/Los_Angeles");
    expect(d.toISOString()).toBe("2026-03-08T08:00:00.000Z");
  });

  it("handles DST fall-back boundary (Los Angeles, 2026-11-01)", () => {
    // Nov 1 2026: DST ends at 02:00; midnight is still PDT (UTC-7) → 07:00Z
    const d = zonedMidnightToUtc("2026-11-01", "America/Los_Angeles");
    expect(d.toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });
});

// biome-ignore lint/security/noSecrets: function name, not a secret
describe("computeLocalDayWindows", () => {
  it("produces contiguous 24h windows in UTC", () => {
    const now = new Date("2026-04-12T12:00:00Z");
    const w = computeLocalDayWindows("UTC", now);
    expect(w.todayStart.toISOString()).toBe("2026-04-12T00:00:00.000Z");
    expect(w.todayEnd.toISOString()).toBe("2026-04-13T00:00:00.000Z");
    expect(w.tomorrowStart.toISOString()).toBe("2026-04-13T00:00:00.000Z");
    expect(w.tomorrowEnd.toISOString()).toBe("2026-04-14T00:00:00.000Z");
  });

  it("computes correct windows for Los Angeles", () => {
    const now = new Date("2026-04-12T18:00:00Z"); // 11:00 PDT on Apr 12
    const w = computeLocalDayWindows("America/Los_Angeles", now);
    expect(w.todayStart.toISOString()).toBe("2026-04-12T07:00:00.000Z");
    expect(w.todayEnd.toISOString()).toBe("2026-04-13T07:00:00.000Z");
  });

  it("rolls over to the next day for Asia/Shanghai after local midnight", () => {
    // 2026-04-12 17:00 UTC = 2026-04-13 01:00 in Shanghai → today is Apr 13 local
    const now = new Date("2026-04-12T17:00:00Z");
    const w = computeLocalDayWindows("Asia/Shanghai", now);
    expect(w.todayStart.toISOString()).toBe("2026-04-12T16:00:00.000Z");
    expect(w.todayEnd.toISOString()).toBe("2026-04-13T16:00:00.000Z");
  });

  it("throws on an invalid timezone", () => {
    expect(() => computeLocalDayWindows("Nowhere/Land")).toThrow();
  });
});

describe("eventOverlapsWindow", () => {
  const winStart = new Date("2026-04-12T00:00:00Z");
  const winEnd = new Date("2026-04-13T00:00:00Z");

  it("returns true for an event fully inside the window", () => {
    expect(
      eventOverlapsWindow(
        new Date("2026-04-12T10:00:00Z"),
        new Date("2026-04-12T11:00:00Z"),
        winStart,
        winEnd,
      ),
    ).toBe(true);
  });

  it("returns true for an event that starts before and ends inside", () => {
    expect(
      eventOverlapsWindow(
        new Date("2026-04-11T22:00:00Z"),
        new Date("2026-04-12T01:00:00Z"),
        winStart,
        winEnd,
      ),
    ).toBe(true);
  });

  it("returns true for an event that starts inside and ends after", () => {
    expect(
      eventOverlapsWindow(
        new Date("2026-04-12T23:00:00Z"),
        new Date("2026-04-13T01:00:00Z"),
        winStart,
        winEnd,
      ),
    ).toBe(true);
  });

  it("returns true for an event that fully spans the window", () => {
    expect(
      eventOverlapsWindow(
        new Date("2026-04-10T00:00:00Z"),
        new Date("2026-04-20T00:00:00Z"),
        winStart,
        winEnd,
      ),
    ).toBe(true);
  });

  it("returns false for an event entirely before the window", () => {
    expect(
      eventOverlapsWindow(
        new Date("2026-04-11T10:00:00Z"),
        new Date("2026-04-11T11:00:00Z"),
        winStart,
        winEnd,
      ),
    ).toBe(false);
  });

  it("returns false for an event entirely after the window", () => {
    expect(
      eventOverlapsWindow(
        new Date("2026-04-13T10:00:00Z"),
        new Date("2026-04-13T11:00:00Z"),
        winStart,
        winEnd,
      ),
    ).toBe(false);
  });

  it("returns false for an event touching the right edge (end === winStart)", () => {
    expect(
      eventOverlapsWindow(
        new Date("2026-04-11T23:00:00Z"),
        new Date("2026-04-12T00:00:00Z"),
        winStart,
        winEnd,
      ),
    ).toBe(false);
  });
});
