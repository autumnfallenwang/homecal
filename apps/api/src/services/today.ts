/**
 * Timezone-aware local-day window helpers for GET /api/events/today.
 *
 * Computes "today" and "tomorrow" [start, end) UTC windows from an IANA
 * timezone. Handles DST transitions correctly because the offset is
 * recalculated at the target date, not at the current moment.
 */

export interface LocalDayWindows {
  todayStart: Date;
  todayEnd: Date;
  tomorrowStart: Date;
  tomorrowEnd: Date;
}

interface DateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

/**
 * Extract wall-clock Y/M/D/H/M/S in the given timezone for a given instant.
 * Throws `RangeError` if the timezone is not a valid IANA zone.
 */
export function getLocalParts(instant: Date, tz: string): DateParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) {
    parts[p.type] = p.value;
  }
  // Intl can emit "24" for the midnight hour — normalize to "00".
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/**
 * Convert a `YYYY-MM-DD` local date (at 00:00 wall time in `tz`) to its UTC
 * instant. Iterates once to correct for DST offset at the target date.
 */
export function zonedMidnightToUtc(localDate: string, tz: string): Date {
  // First pass: pretend the wall-clock midnight is a UTC instant.
  const estimate = new Date(`${localDate}T00:00:00Z`);
  // See what wall-clock that instant actually shows in tz.
  const atEstimate = getLocalParts(estimate, tz);
  const wallClockIso = `${atEstimate.year}-${atEstimate.month}-${atEstimate.day}T${atEstimate.hour}:${atEstimate.minute}:${atEstimate.second}Z`;
  const offsetMs = new Date(wallClockIso).getTime() - estimate.getTime();
  return new Date(estimate.getTime() - offsetMs);
}

function addDaysUtc(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/**
 * Given an IANA timezone and the current instant, compute the UTC windows
 * for "today" [start, end) and "tomorrow" [start, end). Throws `RangeError`
 * if the timezone is invalid.
 */
export function computeLocalDayWindows(tz: string, now: Date = new Date()): LocalDayWindows {
  const parts = getLocalParts(now, tz);
  const todayLocal = `${parts.year}-${parts.month}-${parts.day}`;
  const tomorrowLocal = addDaysUtc(todayLocal, 1);
  const dayAfterLocal = addDaysUtc(todayLocal, 2);

  return {
    todayStart: zonedMidnightToUtc(todayLocal, tz),
    todayEnd: zonedMidnightToUtc(tomorrowLocal, tz),
    tomorrowStart: zonedMidnightToUtc(tomorrowLocal, tz),
    tomorrowEnd: zonedMidnightToUtc(dayAfterLocal, tz),
  };
}

/** `event.start < winEnd && event.end > winStart` — classic overlap check. */
export function eventOverlapsWindow(
  eventStart: Date,
  eventEnd: Date,
  winStart: Date,
  winEnd: Date,
): boolean {
  return eventStart.getTime() < winEnd.getTime() && eventEnd.getTime() > winStart.getTime();
}
