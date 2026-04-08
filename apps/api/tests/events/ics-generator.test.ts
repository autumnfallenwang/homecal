import { describe, expect, it } from "vitest";
import { generateIcs } from "../../src/services/ics-generator.js";

function makeEvent(overrides: Partial<Parameters<typeof generateIcs>[0][0]> = {}) {
  return {
    id: "test-id-1",
    title: "Dentist appointment",
    location: "Dr. Smith clinic" as string | null,
    description: "Annual checkup" as string | null,
    start: new Date("2026-04-14T14:30:00Z"),
    end: new Date("2026-04-14T15:30:00Z"),
    private: false,
    ...overrides,
  };
}

describe("generateIcs", () => {
  it("generates valid VCALENDAR wrapper", () => {
    const ics = generateIcs([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//HomeCal//HomeCal//EN");
    expect(ics).toContain("CALSCALE:GREGORIAN");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("generates empty calendar for no events", () => {
    const ics = generateIcs([]);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("generates VEVENT with correct fields", () => {
    const ics = generateIcs([makeEvent()]);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:test-id-1@homecal");
    expect(ics).toContain("SUMMARY:Dentist appointment");
    expect(ics).toContain("DTSTART:20260414T143000Z");
    expect(ics).toContain("DTEND:20260414T153000Z");
    expect(ics).toContain("LOCATION:Dr. Smith clinic");
    expect(ics).toContain("DESCRIPTION:Annual checkup");
    expect(ics).toContain("CLASS:PUBLIC");
    expect(ics).toContain("END:VEVENT");
  });

  it("handles private events", () => {
    const ics = generateIcs([makeEvent({ private: true })]);
    expect(ics).toContain("CLASS:PRIVATE");
  });

  it("omits LOCATION when null", () => {
    const ics = generateIcs([makeEvent({ location: null })]);
    expect(ics).not.toContain("LOCATION:");
  });

  it("omits DESCRIPTION when null", () => {
    const ics = generateIcs([makeEvent({ description: null })]);
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("escapes special characters in text fields", () => {
    const ics = generateIcs([
      makeEvent({
        title: "Meeting; with, team",
        location: "Room\\1",
        description: "Line 1\nLine 2",
      }),
    ]);
    expect(ics).toContain("SUMMARY:Meeting\\; with\\, team");
    expect(ics).toContain("LOCATION:Room\\\\1");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2");
  });

  it("generates multiple VEVENTs", () => {
    const ics = generateIcs([
      makeEvent({ id: "id-1", title: "Event 1" }),
      makeEvent({ id: "id-2", title: "Event 2" }),
    ]);
    expect(ics).toContain("UID:id-1@homecal");
    expect(ics).toContain("UID:id-2@homecal");
    expect(ics).toContain("SUMMARY:Event 1");
    expect(ics).toContain("SUMMARY:Event 2");
  });

  it("uses CRLF line endings", () => {
    const ics = generateIcs([makeEvent()]);
    expect(ics).toContain("\r\n");
  });
});
