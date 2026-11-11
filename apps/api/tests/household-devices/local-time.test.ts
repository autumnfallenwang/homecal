import { describe, expect, it } from "vitest";
import {
  addDays,
  isQuietAt,
  localDateOf,
  quietWindowsFor,
  weekdayOf,
  zonedTimeToUtc,
} from "../../src/services/local-time.js";

const NY = "America/New_York";
const SCHOOL_NIGHTS = { enabled: true, start: "21:00", end: "07:00", days: [0, 1, 2, 3, 4] };

describe("wall-clock time to a UTC instant", () => {
  it("uses the offset at the target date, on both sides of the November DST change", () => {
    // DST ended 2026-11-01: EDT (UTC-4) before, EST (UTC-5) after.
    expect(zonedTimeToUtc("2026-10-31", "06:45", NY).toISOString()).toBe(
      "2026-10-31T10:45:00.000Z",
    );
    expect(zonedTimeToUtc("2026-11-02", "06:45", NY).toISOString()).toBe(
      "2026-11-02T11:45:00.000Z",
    );
  });

  it("handles the March spring-forward and other zones", () => {
    expect(zonedTimeToUtc("2026-03-09", "06:45", NY).toISOString()).toBe(
      "2026-03-09T10:45:00.000Z",
    );
    expect(zonedTimeToUtc("2026-11-10", "07:00", "Asia/Taipei").toISOString()).toBe(
      "2026-11-09T23:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-11-10", "07:00", "UTC").toISOString()).toBe(
      "2026-11-10T07:00:00.000Z",
    );
  });
});

describe("date helpers", () => {
  it("numbers weekdays from Sunday = 0 (JavaScript getDay), unlike Monday-based series", () => {
    expect(weekdayOf("2026-11-08")).toBe(0);
    expect(weekdayOf("2026-11-10")).toBe(2);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds the local date of an instant late in the evening", () => {
    // 03:30 UTC on the 11th is still the 10th in New York.
    expect(localDateOf(new Date("2026-11-11T03:30:00Z"), NY)).toBe("2026-11-10");
  });
});

describe("quietWindowsFor", () => {
  it("covers a school night across midnight", () => {
    // Tuesday 2026-11-10, 22:00 EST = 03:00Z on the 11th.
    const at = new Date("2026-11-11T03:00:00Z");
    const windows = quietWindowsFor(SCHOOL_NIGHTS, NY, at);
    const w = isQuietAt(windows, at);
    expect(w?.start.toISOString()).toBe("2026-11-11T02:00:00.000Z");
    expect(w?.end.toISOString()).toBe("2026-11-11T12:00:00.000Z");
  });

  it("leaves Friday and Saturday nights loud", () => {
    // Friday 2026-11-13 at 23:00 EST.
    const friday = new Date("2026-11-14T04:00:00Z");
    expect(isQuietAt(quietWindowsFor(SCHOOL_NIGHTS, NY, friday), friday)).toBeNull();
  });

  it("is empty when quiet hours are off", () => {
    expect(quietWindowsFor({ ...SCHOOL_NIGHTS, enabled: false }, NY, new Date())).toEqual([]);
  });

  it("still covers the early morning of a night that started yesterday", () => {
    // Wednesday 2026-11-11 at 06:00 EST: Tuesday night's window.
    const morning = new Date("2026-11-11T11:00:00Z");
    expect(isQuietAt(quietWindowsFor(SCHOOL_NIGHTS, NY, morning), morning)).not.toBeNull();
  });
});
