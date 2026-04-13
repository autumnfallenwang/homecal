import type { Holiday } from "@homecal/shared";

/**
 * Build a local-date key (`YYYY-MM-DD`) for matching against the API's
 * holiday `date` field. NOT via `toISOString()` — that would round-trip
 * through UTC and shift dates near midnight in non-UTC timezones.
 */
export function holidayKey(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Group a flat holiday list by their `date` field. The API already dedupes
 * across countries so there's at most one row per date.
 */
export function indexHolidaysByDate(holidays: Holiday[]): Map<string, Holiday> {
  const out = new Map<string, Holiday>();
  for (const h of holidays) {
    out.set(h.date, h);
  }
  return out;
}
