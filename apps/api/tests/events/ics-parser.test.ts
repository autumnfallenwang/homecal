import { describe, expect, it } from "vitest";
import { parseIcsEvents } from "../../src/services/ics-parser.js";

const makeIcs = (vevents: string) => `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
${vevents}
END:VCALENDAR`;

const singleEvent = makeIcs(`BEGIN:VEVENT
DTSTART:20260414T143000Z
DTEND:20260414T153000Z
SUMMARY:Dentist appointment
LOCATION:Dr. Smith clinic
DESCRIPTION:Annual checkup
UID:test-uid-1
END:VEVENT`);

describe("parseIcsEvents", () => {
  it("parses a single VEVENT with all fields", () => {
    const result = parseIcsEvents(singleEvent);
    expect(result.events).toHaveLength(1);
    expect(result.skipped).toBe(0);

    const event = result.events[0];
    expect(event.title).toBe("Dentist appointment");
    expect(event.start).toBe("2026-04-14T14:30:00.000Z");
    expect(event.end).toBe("2026-04-14T15:30:00.000Z");
    expect(event.location).toBe("Dr. Smith clinic");
    expect(event.description).toBe("Annual checkup");
    expect(event.isPrivate).toBe(false);
    expect(event.isAllDay).toBe(false);
  });

  it("handles all-day events (DATE-only)", () => {
    const ics = makeIcs(`BEGIN:VEVENT
DTSTART;VALUE=DATE:20260415
DTEND;VALUE=DATE:20260416
SUMMARY:Holiday
UID:test-uid-allday
END:VEVENT`);

    const result = parseIcsEvents(ics);
    expect(result.events).toHaveLength(1);

    const event = result.events[0];
    expect(event.isAllDay).toBe(true);
    expect(event.start).toBe("2026-04-15T00:00:00.000Z");
    expect(event.end).toBe("2026-04-16T00:00:00.000Z");
  });

  it("handles all-day event with missing end (defaults to next day)", () => {
    const ics = makeIcs(`BEGIN:VEVENT
DTSTART;VALUE=DATE:20260415
SUMMARY:Single day
UID:test-uid-allday-noend
END:VEVENT`);

    const result = parseIcsEvents(ics);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].start).toBe("2026-04-15T00:00:00.000Z");
    expect(result.events[0].end).toBe("2026-04-16T00:00:00.000Z");
  });

  it("handles missing end time for timed event (defaults to +1 hour)", () => {
    const ics = makeIcs(`BEGIN:VEVENT
DTSTART:20260414T140000Z
SUMMARY:Quick meeting
UID:test-uid-noend
END:VEVENT`);

    const result = parseIcsEvents(ics);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].start).toBe("2026-04-14T14:00:00.000Z");
    expect(result.events[0].end).toBe("2026-04-14T15:00:00.000Z");
  });

  it("maps CLASS:PRIVATE to isPrivate", () => {
    const ics = makeIcs(`BEGIN:VEVENT
DTSTART:20260414T140000Z
DTEND:20260414T150000Z
SUMMARY:Private meeting
CLASS:PRIVATE
UID:test-uid-private
END:VEVENT`);

    const result = parseIcsEvents(ics);
    expect(result.events[0].isPrivate).toBe(true);
  });

  it("skips non-VEVENT entries", () => {
    const ics = makeIcs(`BEGIN:VTODO
SUMMARY:Buy groceries
UID:test-uid-todo
END:VTODO
BEGIN:VEVENT
DTSTART:20260414T140000Z
DTEND:20260414T150000Z
SUMMARY:Real event
UID:test-uid-real
END:VEVENT`);

    const result = parseIcsEvents(ics);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toBe("Real event");
  });

  it("skips RRULE events and counts them", () => {
    const ics = makeIcs(`BEGIN:VEVENT
DTSTART:20260414T140000Z
DTEND:20260414T150000Z
SUMMARY:Weekly standup
RRULE:FREQ=WEEKLY;BYDAY=MO
UID:test-uid-rrule
END:VEVENT
BEGIN:VEVENT
DTSTART:20260415T100000Z
DTEND:20260415T110000Z
SUMMARY:One-off event
UID:test-uid-oneoff
END:VEVENT`);

    const result = parseIcsEvents(ics);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toBe("One-off event");
    expect(result.skipped).toBe(1);
  });

  it("handles empty .ics content", () => {
    const result = parseIcsEvents("");
    expect(result.events).toHaveLength(0);
    expect(result.skipped).toBe(0);
  });

  it("handles invalid .ics content gracefully", () => {
    const result = parseIcsEvents("not a valid ics file");
    expect(result.events).toHaveLength(0);
    expect(result.skipped).toBe(0);
  });

  it("defaults missing summary to Untitled", () => {
    const ics = makeIcs(`BEGIN:VEVENT
DTSTART:20260414T140000Z
DTEND:20260414T150000Z
UID:test-uid-nosummary
END:VEVENT`);

    const result = parseIcsEvents(ics);
    expect(result.events[0].title).toBe("Untitled");
  });

  it("parses multiple events", () => {
    const ics = makeIcs(`BEGIN:VEVENT
DTSTART:20260414T140000Z
DTEND:20260414T150000Z
SUMMARY:Event 1
UID:test-uid-multi-1
END:VEVENT
BEGIN:VEVENT
DTSTART:20260415T100000Z
DTEND:20260415T110000Z
SUMMARY:Event 2
UID:test-uid-multi-2
END:VEVENT`);

    const result = parseIcsEvents(ics);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].title).toBe("Event 1");
    expect(result.events[1].title).toBe("Event 2");
  });

  it("handles CLASS:PUBLIC as not private", () => {
    const ics = makeIcs(`BEGIN:VEVENT
DTSTART:20260414T140000Z
DTEND:20260414T150000Z
SUMMARY:Public event
CLASS:PUBLIC
UID:test-uid-public
END:VEVENT`);

    const result = parseIcsEvents(ics);
    expect(result.events[0].isPrivate).toBe(false);
  });
});
