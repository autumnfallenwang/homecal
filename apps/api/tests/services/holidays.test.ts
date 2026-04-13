import { beforeEach, describe, expect, it } from "vitest";
import { _resetHolidaysCache, getHolidays, isKnownCountry } from "../../src/services/holidays.js";

describe("holidays service", () => {
  beforeEach(() => {
    _resetHolidaysCache();
  });

  it("returns US public holidays for a calendar year", () => {
    const out = getHolidays({ countries: ["US"], from: "2026-01-01", to: "2026-12-31" });
    // US has ~12 federal public holidays; allow range so the test survives
    // minor upstream data changes in date-holidays.
    expect(out.length).toBeGreaterThanOrEqual(10);
    expect(out.length).toBeLessThanOrEqual(14);
    for (const h of out) {
      expect(h.type).toBe("public");
      expect(h.countries).toEqual(["US"]);
      expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("filters out observances (no Halloween on Oct 31)", () => {
    const out = getHolidays({ countries: ["US"], from: "2026-10-01", to: "2026-10-31" });
    const oct31 = out.find((h) => h.date === "2026-10-31");
    expect(oct31).toBeUndefined();
  });

  it("spans year boundaries (Dec 20 → Jan 5)", () => {
    const out = getHolidays({ countries: ["US"], from: "2025-12-20", to: "2026-01-05" });
    const dates = out.map((h) => h.date);
    // Christmas Day 2025 and New Year's Day 2026 both land in range.
    expect(dates).toContain("2025-12-25");
    expect(dates).toContain("2026-01-01");
  });

  it("clips holidays outside the requested window", () => {
    const out = getHolidays({ countries: ["US"], from: "2026-02-01", to: "2026-02-28" });
    // February only — no New Year's or Memorial Day.
    for (const h of out) {
      expect(h.date >= "2026-02-01").toBe(true);
      expect(h.date <= "2026-02-28").toBe(true);
    }
  });

  it("merges same-date multi-country holidays into a single row", () => {
    const out = getHolidays({ countries: ["US", "TW"], from: "2026-01-01", to: "2026-01-01" });
    // New Year's Day is public in both — should be exactly one row with
    // countries: ["TW","US"] and a joined title.
    const jan1 = out.filter((h) => h.date === "2026-01-01");
    expect(jan1).toHaveLength(1);
    expect(jan1[0].countries.sort()).toEqual(["TW", "US"]);
    expect(jan1[0].title).toContain("·");
  });

  it("keeps single-country holidays separate when dates differ", () => {
    const out = getHolidays({ countries: ["US", "TW"], from: "2026-07-01", to: "2026-07-10" });
    const jul4 = out.find((h) => h.date === "2026-07-04");
    expect(jul4).toBeTruthy();
    expect(jul4?.countries).toEqual(["US"]);
  });

  it("throws on unknown country code", () => {
    expect(() => getHolidays({ countries: ["ZZ"], from: "2026-01-01", to: "2026-12-31" })).toThrow(
      /Unknown country code/,
    );
  });

  it("throws when from > to", () => {
    expect(() => getHolidays({ countries: ["US"], from: "2026-12-31", to: "2026-01-01" })).toThrow(
      /from.*must be.*to/,
    );
  });

  it("isKnownCountry accepts US/TW/GB and rejects junk", () => {
    expect(isKnownCountry("US")).toBe(true);
    expect(isKnownCountry("TW")).toBe(true);
    expect(isKnownCountry("GB")).toBe(true);
    expect(isKnownCountry("ZZ")).toBe(false);
    expect(isKnownCountry("us")).toBe(false);
  });

  it("returns results sorted by date ascending", () => {
    const out = getHolidays({ countries: ["US"], from: "2026-01-01", to: "2026-12-31" });
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].date <= out[i].date).toBe(true);
    }
  });
});
