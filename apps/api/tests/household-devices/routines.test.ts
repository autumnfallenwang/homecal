import { createRoutineSchema } from "@homecal/shared";
import { describe, expect, it } from "vitest";
import { expandRoutine, renderBriefing, spokenText } from "../../src/services/routines.js";

const NY = "America/New_York";
const WEEKDAYS = "1,2,3,4,5";

function routine(over: Partial<Parameters<typeof expandRoutine>[0]> = {}) {
  return {
    time: "06:45",
    weekDays: WEEKDAYS,
    enabled: true,
    skipHolidays: true,
    pausedUntil: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

function expand(
  r = routine(),
  opts: Partial<{ from: Date; to: Date; holidays: Set<string>; skips: Set<string> }> = {},
) {
  return expandRoutine(r, {
    tz: NY,
    // Sunday 2026-11-08 00:00 EST → Sunday 2026-11-15.
    from: new Date("2026-11-08T05:00:00Z"),
    to: new Date("2026-11-15T05:00:00Z"),
    holidays: new Set(),
    skips: new Set(),
    ...opts,
  });
}

describe("expandRoutine", () => {
  it("yields one occurrence per selected weekday at the local time", () => {
    const out = expand();
    expect(out.map((o) => o.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
    ]);
    // 06:45 EST = 11:45Z.
    expect(out[0].at.toISOString()).toBe("2026-11-09T11:45:00.000Z");
  });

  it("keeps the wall-clock time across the DST change", () => {
    const out = expand(routine({ weekDays: "0,1,2,3,4,5,6" }), {
      from: new Date("2026-10-30T04:00:00Z"),
      to: new Date("2026-11-03T05:00:00Z"),
    });
    const byDate = Object.fromEntries(out.map((o) => [o.date, o.at.toISOString()]));
    expect(byDate["2026-10-31"]).toBe("2026-10-31T10:45:00.000Z"); // EDT
    expect(byDate["2026-11-02"]).toBe("2026-11-02T11:45:00.000Z"); // EST
  });

  it("skips holidays only when asked to", () => {
    const holidays = new Set(["2026-11-11"]);
    expect(expand(routine(), { holidays }).map((o) => o.date)).not.toContain("2026-11-11");
    expect(expand(routine({ skipHolidays: false }), { holidays }).map((o) => o.date)).toContain(
      "2026-11-11",
    );
  });

  it("honours one-off skips and a pause through a date (inclusive)", () => {
    expect(expand(routine(), { skips: new Set(["2026-11-10"]) }).map((o) => o.date)).not.toContain(
      "2026-11-10",
    );
    expect(expand(routine({ pausedUntil: "2026-11-11" })).map((o) => o.date)).toEqual([
      "2026-11-12",
      "2026-11-13",
    ]);
  });

  it("yields nothing when disabled, and nothing before the routine existed", () => {
    expect(expand(routine({ enabled: false }))).toEqual([]);
    const created = expand(routine({ createdAt: new Date("2026-11-11T12:00:00Z") }));
    expect(created.map((o) => o.date)).toEqual(["2026-11-12", "2026-11-13"]);
  });

  it("stays inside the requested window", () => {
    const out = expand(routine(), {
      from: new Date("2026-11-10T11:50:00Z"),
      to: new Date("2026-11-11T11:45:00Z"),
    });
    expect(out.map((o) => o.date)).toEqual(["2026-11-11"]);
  });
});

describe("renderBriefing", () => {
  const at = (iso: string) => new Date(iso);

  it("reads out the day's events with spoken times", () => {
    const text = renderBriefing(
      [
        {
          title: "Soccer practice",
          start: at("2026-11-10T21:00:00Z"),
          end: at("2026-11-10T22:00:00Z"),
        },
        { title: "Dentist", start: at("2026-11-10T22:30:00Z"), end: at("2026-11-10T23:00:00Z") },
      ],
      "2026-11-10",
      NY,
    );
    expect(text).toBe("Today: Soccer practice at 4 PM and Dentist at 5:30 PM.");
  });

  it("says so when the day is empty, and marks events that started earlier as all day", () => {
    expect(renderBriefing([], "2026-11-10", NY)).toBe("Nothing on the calendar today.");
    const text = renderBriefing(
      [{ title: "Trip", start: at("2026-11-09T05:00:00Z"), end: at("2026-11-12T05:00:00Z") }],
      "2026-11-10",
      NY,
    );
    expect(text).toBe("Today: Trip, all day.");
  });

  it("caps a busy day at six items", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      title: `Thing ${i + 1}`,
      start: at(`2026-11-10T${String(14 + i).padStart(2, "0")}:00:00Z`),
      end: at(`2026-11-10T${String(14 + i).padStart(2, "0")}:30:00Z`),
    }));
    expect(renderBriefing(many, "2026-11-10", NY)).toContain("and 2 more.");
  });
});

describe("routine text and validation", () => {
  it("falls back to the member's name and the title when there is no message", () => {
    expect(spokenText({ title: "Wake up", message: "" }, "Carol")).toBe("Carol, wake up.");
    expect(spokenText({ title: "Wake up", message: "Good morning!" }, "Carol")).toBe(
      "Good morning!",
    );
  });

  it("rejects a bad time, no days, and an unknown sound", () => {
    const base = {
      memberId: "5b0f1a30-0d53-4c50-9a76-2b3c3b5f3a11",
      title: "Wake up",
      time: "06:45",
      weekDays: [1, 2, 3, 4, 5],
    };
    expect(createRoutineSchema.safeParse(base).success).toBe(true);
    expect(createRoutineSchema.safeParse({ ...base, time: "6:45am" }).success).toBe(false);
    expect(createRoutineSchema.safeParse({ ...base, weekDays: [] }).success).toBe(false);
    expect(createRoutineSchema.safeParse({ ...base, weekDays: [7] }).success).toBe(false);
    expect(createRoutineSchema.safeParse({ ...base, sound: "trumpet" }).success).toBe(false);
  });
});
