import { describe, expect, it } from "vitest";
import {
  formatLocalTimeRange,
  renderDigest,
  renderDigestHtml,
  renderDigestPrintPage,
} from "../../src/services/digest.js";
import { isDigestDue } from "../../src/services/digest-settings.js";

const utc = (iso: string) => new Date(iso);

describe("formatLocalTimeRange", () => {
  it("formats an afternoon range with a single trailing meridiem", () => {
    expect(
      formatLocalTimeRange(utc("2026-07-08T16:00:00Z"), utc("2026-07-08T17:30:00Z"), "UTC"),
    ).toBe("4–5:30p");
  });

  it("drops :00 minutes and uses a lowercase am suffix", () => {
    expect(
      formatLocalTimeRange(utc("2026-07-08T09:00:00Z"), utc("2026-07-08T09:30:00Z"), "UTC"),
    ).toBe("9–9:30a");
  });

  it("shows both meridiems when the range crosses noon", () => {
    expect(
      formatLocalTimeRange(utc("2026-07-08T11:30:00Z"), utc("2026-07-08T12:30:00Z"), "UTC"),
    ).toBe("11:30a–12:30p");
  });

  it("renders in the given timezone, not UTC", () => {
    // 16:00Z is 12:00 EDT (UTC-4) in July.
    expect(
      formatLocalTimeRange(
        utc("2026-07-08T16:00:00Z"),
        utc("2026-07-08T17:00:00Z"),
        "America/New_York",
      ),
    ).toBe("12–1p");
  });
});

describe("renderDigest", () => {
  const now = utc("2026-07-08T12:00:00Z"); // Wednesday

  it("lists events with time · title · location · assignees", () => {
    const { subject, text } = renderDigest({
      tz: "UTC",
      now,
      events: [
        {
          title: "Standup",
          start: utc("2026-07-08T09:00:00Z"),
          end: utc("2026-07-08T09:30:00Z"),
          location: null,
          assignees: [{ name: "Admin", color: "#4F46E5" }],
        },
        {
          title: "Soccer practice",
          start: utc("2026-07-08T16:00:00Z"),
          end: utc("2026-07-08T17:30:00Z"),
          location: "Community Field",
          assignees: [
            { name: "Carol", color: "#DB2777" },
            { name: "Dave", color: "#D97706" },
          ],
        },
      ],
    });

    expect(subject).toBe("Today on the family calendar — Wed, Jul 8");
    expect(text).toContain("Wednesday, July 8");
    expect(text).toContain("2 events today:");
    expect(text).toContain("9–9:30a · Standup · Admin");
    expect(text).toContain("4–5:30p · Soccer practice · Community Field · Carol, Dave");
  });

  it("uses a friendly one-liner on an empty day", () => {
    const { subject, text } = renderDigest({ tz: "UTC", now, events: [] });
    expect(subject).toBe("Today on the family calendar — Wed, Jul 8");
    expect(text).toContain("Nothing on the calendar today.");
    expect(text).not.toContain("event");
  });
});

describe("isDigestDue", () => {
  const base = { enabled: true, sendAt: "07:00", timezone: "UTC", lastSentOn: null };

  it("is false when disabled", () => {
    expect(isDigestDue({ ...base, enabled: false }, utc("2026-07-08T07:00:00Z"))).toBe(false);
  });

  it("fires exactly at the send time", () => {
    expect(isDigestDue(base, utc("2026-07-08T07:00:00Z"))).toBe(true);
  });

  it("fires within the short grace window just after the send time", () => {
    expect(isDigestDue(base, utc("2026-07-08T07:04:00Z"))).toBe(true);
  });

  it("does NOT fire well after the send time — enabling later in the day must not send", () => {
    expect(isDigestDue(base, utc("2026-07-08T08:00:00Z"))).toBe(false); // 1h later
    expect(isDigestDue(base, utc("2026-07-08T19:46:00Z"))).toBe(false); // that evening
  });

  it("is false before the send time", () => {
    expect(isDigestDue(base, utc("2026-07-08T06:59:00Z"))).toBe(false);
  });

  it("is false when already sent today (dedup)", () => {
    expect(isDigestDue({ ...base, lastSentOn: "2026-07-08" }, utc("2026-07-08T07:00:00Z"))).toBe(
      false,
    );
  });

  it("fires again on a new local day", () => {
    expect(isDigestDue({ ...base, lastSentOn: "2026-07-07" }, utc("2026-07-08T07:02:00Z"))).toBe(
      true,
    );
  });

  it("evaluates the send window in the configured timezone", () => {
    // sendAt 07:00 ET: 11:00Z = 07:00 EDT → fires; 10:30Z = 06:30 EDT → early;
    // 12:00Z = 08:00 EDT → an hour past → outside the window.
    const tzBase = { ...base, timezone: "America/New_York" };
    expect(isDigestDue(tzBase, utc("2026-07-08T11:00:00Z"))).toBe(true);
    expect(isDigestDue(tzBase, utc("2026-07-08T10:30:00Z"))).toBe(false);
    expect(isDigestDue(tzBase, utc("2026-07-08T12:00:00Z"))).toBe(false);
  });
});

describe("edge cases", () => {
  it("formats a midnight range with am", () => {
    expect(
      formatLocalTimeRange(utc("2026-07-08T00:00:00Z"), utc("2026-07-08T00:30:00Z"), "UTC"),
    ).toBe("12–12:30a");
  });

  it("renders just time · title when an event has no location or assignees", () => {
    const { text } = renderDigest({
      tz: "UTC",
      now: utc("2026-07-08T12:00:00Z"),
      events: [
        {
          title: "Quiet block",
          start: utc("2026-07-08T13:00:00Z"),
          end: utc("2026-07-08T14:00:00Z"),
          location: null,
          assignees: [],
        },
      ],
    });
    expect(text).toContain("1–2p · Quiet block");
    expect(text).not.toContain("· null");
  });
});

describe("renderDigestHtml", () => {
  const now = utc("2026-07-08T12:00:00Z");

  it("produces an HTML doc with each event's time, title, location, and assignees", () => {
    const html = renderDigestHtml({
      tz: "UTC",
      now,
      events: [
        {
          title: "Soccer practice",
          start: utc("2026-07-08T16:00:00Z"),
          end: utc("2026-07-08T17:30:00Z"),
          location: "Community Field",
          assignees: [{ name: "Carol", color: "#DB2777" }],
        },
      ],
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Wednesday");
    expect(html).toContain("July 8");
    expect(html).toContain("1 event today");
    expect(html).toContain("4–5:30p");
    expect(html).toContain("Soccer practice");
    expect(html).toContain("Community Field");
    expect(html).toContain("Carol");
    expect(html).toContain("#DB2777"); // assignee dot color
  });

  it("escapes HTML in user-supplied fields", () => {
    const html = renderDigestHtml({
      tz: "UTC",
      now,
      events: [
        {
          title: 'A & B <tag> "q"',
          start: utc("2026-07-08T09:00:00Z"),
          end: utc("2026-07-08T09:30:00Z"),
          location: null,
          assignees: [],
        },
      ],
    });
    expect(html).toContain("A &amp; B &lt;tag&gt; &quot;q&quot;");
    expect(html).not.toContain("<tag>");
  });

  it("uses the empty-day copy when there are no events", () => {
    expect(renderDigestHtml({ tz: "UTC", now, events: [] })).toContain(
      "Nothing on the calendar today",
    );
  });

  it("rejects a non-hex assignee color (no style injection)", () => {
    const html = renderDigestHtml({
      tz: "UTC",
      now,
      events: [
        {
          title: "Meeting",
          start: utc("2026-07-08T10:00:00Z"),
          end: utc("2026-07-08T10:30:00Z"),
          location: null,
          assignees: [{ name: "X", color: "red;background:url(evil)" }],
        },
      ],
    });
    expect(html).not.toContain("url(evil)");
    expect(html).toContain("#7a6f5c"); // fallback color
  });
});

describe("renderDigestPrintPage", () => {
  it("renders a printable page with the digest content and an auto-print script", () => {
    const html = renderDigestPrintPage({
      tz: "UTC",
      now: utc("2026-07-08T12:00:00Z"),
      events: [
        {
          title: "Soccer practice",
          start: utc("2026-07-08T16:00:00Z"),
          end: utc("2026-07-08T17:30:00Z"),
          location: "Community Field",
          assignees: [{ name: "Carol", color: "#DB2777" }],
        },
      ],
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("@media print");
    expect(html).toContain("window.print()");
    expect(html).toContain("Soccer practice");
    expect(html).toContain("4–5:30p");
    expect(html).toContain("July 8"); // shared card content
  });
});
