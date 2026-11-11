/**
 * Wall-clock helpers for the household timezone (Phases 24–26). The speaker is
 * sent exact UTC instants, so all timezone, DST and weekday logic lives here.
 */

import type { QuietHours } from "@homecal/shared";
import { getLocalParts } from "./today.js";

/** Local `YYYY-MM-DD` of an instant in `tz`. */
export function localDateOf(instant: Date, tz: string): string {
  const p = getLocalParts(instant, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Local `HH:MM` of an instant in `tz`. */
export function localTimeOf(instant: Date, tz: string): string {
  const p = getLocalParts(instant, tz);
  return `${p.hour}:${p.minute}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday (JavaScript getDay). Series weekDays are Monday-based. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The UTC instant at which the wall clock in `tz` reads `date hh:mm`. Two
 * passes correct for the offset at the target moment, so DST changes are
 * handled; a time skipped by a spring-forward lands an hour later.
 */
export function zonedTimeToUtc(date: string, hhmm: string, tz: string): Date {
  const target = Date.parse(`${date}T${hhmm}:00Z`);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = getLocalParts(new Date(guess), tz);
    const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    guess += target - wall;
  }
  return new Date(guess);
}

export interface Window {
  start: Date;
  end: Date;
}

/**
 * Concrete quiet windows from yesterday through `days` ahead, as instants.
 * A night is listed under the weekday it starts on; `end` at or before `start`
 * crosses midnight. Windows already over at `now` are dropped.
 */
export function quietWindowsFor(quiet: QuietHours, tz: string, now: Date, days = 7): Window[] {
  if (!quiet.enabled || quiet.days.length === 0) return [];
  const today = localDateOf(now, tz);
  const out: Window[] = [];
  for (let i = -1; i <= days; i++) {
    const date = addDays(today, i);
    if (!quiet.days.includes(weekdayOf(date))) continue;
    const start = zonedTimeToUtc(date, quiet.start, tz);
    const endDate = quiet.end <= quiet.start ? addDays(date, 1) : date;
    const end = zonedTimeToUtc(endDate, quiet.end, tz);
    if (end > now) out.push({ start, end });
  }
  return out;
}

export function isQuietAt(windows: Window[], instant: Date): Window | null {
  return windows.find((w) => w.start <= instant && instant < w.end) ?? null;
}
