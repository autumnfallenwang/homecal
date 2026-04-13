import type { CalendarEvent } from "@/hooks/use-events";

export const HOUR_START = 0;
export const HOUR_END = 24;
export const HOUR_COUNT = HOUR_END - HOUR_START;
export const HOUR_HEIGHT = 48;
export const DEFAULT_SCROLL_HOUR = 7;

export interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  col: number;
  totalCols: number;
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Compact hour label: `12a`, `1`, `2`, ..., `11`, `12p`, `1`, ...
 * Only am/pm boundaries show a suffix — keeps the gutter calm.
 */
export function formatHourCompact(hour: number): string {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  if (hour < 12) return String(hour);
  return String(hour - 12);
}

/** `7a` or `6:30p` — same compressed style used by event pills. */
export function formatHourMinute(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const suffix = h < 12 ? "a" : "p";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${m.toString().padStart(2, "0")}${suffix}`;
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatHourMinute(start)} – ${formatHourMinute(end)}`;
}

/** Vertical position in px for a given hour-of-day (0–24). */
export function hourTop(hour: number): number {
  return (hour - HOUR_START) * HOUR_HEIGHT;
}

/** Vertical position in px for a Date object (local time). */
export function dateTop(date: Date): number {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return ((minutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;
}

/**
 * Assigns each event a column in its day so overlapping events stack side-by-side.
 * Shared between WeekGrid and DayGrid.
 */
export function positionEvents(dayEvents: CalendarEvent[]): PositionedEvent[] {
  if (dayEvents.length === 0) return [];

  const sorted = [...dayEvents].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const positioned: PositionedEvent[] = [];
  const columns: { end: number }[] = [];

  for (const event of sorted) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    const top = ((startMinutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;
    const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 14);

    let col = 0;
    while (col < columns.length && columns[col].end > startMinutes) {
      col++;
    }

    if (col < columns.length) {
      columns[col].end = endMinutes;
    } else {
      columns.push({ end: endMinutes });
    }

    positioned.push({ event, top, height, col, totalCols: 0 });
  }

  const totalCols = columns.length;
  for (const p of positioned) {
    p.totalCols = totalCols;
  }

  return positioned;
}
