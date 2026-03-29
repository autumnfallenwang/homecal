import { describe, expect, it } from "vitest";
import { formatReminderBody } from "../../src/services/reminder-scheduler.js";

describe("formatReminderBody", () => {
  it("formats 1 minute", () => {
    expect(formatReminderBody(1)).toBe("in 1 minute");
  });

  it("formats minutes (< 60)", () => {
    expect(formatReminderBody(15)).toBe("in 15 minutes");
    expect(formatReminderBody(30)).toBe("in 30 minutes");
    expect(formatReminderBody(45)).toBe("in 45 minutes");
  });

  it("formats exactly 1 hour", () => {
    expect(formatReminderBody(60)).toBe("in 1 hour");
  });

  it("formats hours (61-1439)", () => {
    expect(formatReminderBody(120)).toBe("in 2 hours");
    expect(formatReminderBody(180)).toBe("in 3 hours");
    expect(formatReminderBody(360)).toBe("in 6 hours");
  });

  it("formats exactly 1 day (1440 = tomorrow)", () => {
    expect(formatReminderBody(1440)).toBe("tomorrow");
  });

  it("formats multiple days", () => {
    expect(formatReminderBody(2880)).toBe("in 2 days");
    expect(formatReminderBody(4320)).toBe("in 3 days");
    expect(formatReminderBody(10080)).toBe("in 7 days");
  });
});
