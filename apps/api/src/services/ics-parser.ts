import ical from "node-ical";

export interface ParsedIcsEvent {
  title: string;
  start: string; // ISO 8601 UTC
  end: string; // ISO 8601 UTC
  location: string;
  description: string;
  isPrivate: boolean;
  isAllDay: boolean;
}

export interface ParseIcsResult {
  events: ParsedIcsEvent[];
  skipped: number;
}

function dateToMidnightUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// node-ical typed fields like summary/location/description can come through
// as either a plain string or a `{ val: string; params: ... }` object (when the
// VEVENT has parameters like LANGUAGE). Normalize both to a plain string.
function icsString(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "val" in v) {
    const val = (v as { val: unknown }).val;
    return typeof val === "string" ? val : "";
  }
  return "";
}

export function parseIcsEvents(icsText: string): ParseIcsResult {
  let parsed: ical.CalendarResponse;
  try {
    parsed = ical.sync.parseICS(icsText);
  } catch {
    return { events: [], skipped: 0 };
  }

  const events: ParsedIcsEvent[] = [];
  let skipped = 0;

  for (const key of Object.keys(parsed)) {
    const entry = parsed[key];
    if (!entry || entry.type !== "VEVENT") continue;

    const vevent = entry as ical.VEvent;

    // Skip recurring events (RRULE) for v1
    if (vevent.rrule) {
      skipped++;
      continue;
    }

    if (!vevent.start) continue;

    const start = vevent.start as Date;
    // biome-ignore lint/suspicious/noExplicitAny: node-ical dateOnly property not in types
    const isAllDay = (start as any).dateOnly === true;

    let startStr: string;
    let endStr: string;

    const end = vevent.end ? (vevent.end as Date) : null;
    const hasRealEnd = end && end.getTime() !== start.getTime();

    if (isAllDay) {
      startStr = dateToMidnightUtc(start);
      endStr = hasRealEnd ? dateToMidnightUtc(end) : dateToMidnightUtc(addDays(start, 1));
    } else {
      startStr = start.toISOString();
      endStr = hasRealEnd
        ? end.toISOString()
        : new Date(start.getTime() + 60 * 60 * 1000).toISOString();
    }

    events.push({
      title: icsString(vevent.summary) || "Untitled",
      start: startStr,
      end: endStr,
      location: icsString(vevent.location),
      description: icsString(vevent.description),
      isPrivate: vevent.class === "PRIVATE",
      isAllDay,
    });
  }

  return { events, skipped };
}
