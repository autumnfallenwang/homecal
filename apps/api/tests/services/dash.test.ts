import { describe, expect, it } from "vitest";
import { initialsFor, renderDashPage } from "../../src/services/dash.js";
import type { DigestEventInput } from "../../src/services/digest.js";

const utc = (iso: string) => new Date(iso);

const ev = (
  title: string,
  start: string,
  end: string,
  extra: Partial<DigestEventInput> = {},
): DigestEventInput => ({
  title,
  start: utc(start),
  end: utc(end),
  location: null,
  assignees: [],
  ...extra,
});

describe("initialsFor", () => {
  it("takes the first letter of a single name", () => {
    expect(initialsFor("Alice")).toBe("A");
  });

  it("combines first and last initials for a full name", () => {
    expect(initialsFor("Mary Jane Watson")).toBe("MW");
  });

  it("uppercases a lowercase name", () => {
    expect(initialsFor("bob")).toBe("B");
  });

  it("falls back to a placeholder for an empty name", () => {
    expect(initialsFor("   ")).toBe("?");
  });
});

describe("renderDashPage", () => {
  const now = utc("2026-09-14T14:00:00Z"); // 10:00 in New York

  it("formats times in the supplied zone, not the host zone", () => {
    const html = renderDashPage({
      events: [ev("Soccer practice", "2026-09-14T11:30:00Z", "2026-09-14T12:45:00Z")],
      tz: "America/New_York",
      now,
    });
    // 11:30Z is 7:30a in New York. This is the regression guard for the
    // Kindle browser reporting UTC — the page must never depend on the client.
    expect(html).toContain("7:30–8:45a");
    expect(html).toContain("as of 10:00a");
  });

  it("renders the same events differently in a different zone", () => {
    const events = [ev("Dentist", "2026-09-14T14:00:00Z", "2026-09-14T15:00:00Z")];
    const ny = renderDashPage({ events, tz: "America/New_York", now });
    const utcPage = renderDashPage({ events, tz: "UTC", now });
    expect(ny).toContain("10–11a");
    expect(utcPage).toContain("2–3p");
  });

  it("uses initials rather than colour for assignees", () => {
    const html = renderDashPage({
      events: [
        ev("Family dinner", "2026-09-14T22:30:00Z", "2026-09-15T00:00:00Z", {
          assignees: [
            { name: "Alice", color: "#be5a24" },
            { name: "Dave", color: "#7048e8" },
          ],
        }),
      ],
      tz: "America/New_York",
      now,
    });
    expect(html).toContain(">A</span>");
    expect(html).toContain(">D</span>");
    // Assignee colours are indistinguishable on a greyscale panel, so they
    // must not reach the markup at all.
    expect(html).not.toContain("#be5a24");
    expect(html).not.toContain("#7048e8");
  });

  it("marks events that have already finished as past", () => {
    const html = renderDashPage({
      events: [
        ev("Soccer practice", "2026-09-14T11:30:00Z", "2026-09-14T12:45:00Z"), // ended
        ev("Family dinner", "2026-09-14T22:30:00Z", "2026-09-15T00:00:00Z"), // upcoming
      ],
      tz: "America/New_York",
      now,
    });
    expect(html).toContain('class="ev past"');
    expect(html.match(/class="ev past"/g)).toHaveLength(1);
  });

  it("polls with fetch rather than a navigating meta refresh", () => {
    // A navigating <meta refresh> is a one-way trip on an unattended display:
    // if the server is unreachable when it fires, the browser replaces our
    // page with its own error page, which has no refresh and never retries.
    // Observed in the field after a host reboot. So the only navigating
    // refresh allowed is inside <noscript>.
    const html = renderDashPage({ events: [], tz: "UTC", now, refreshSeconds: 900 });
    const outsideNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    expect(outsideNoscript).not.toContain('http-equiv="refresh"');
    // biome-ignore lint/security/noSecrets: markup assertion, not a credential
    expect(html).toContain('<noscript><meta http-equiv="refresh" content="900"></noscript>');
    expect(html).toContain("fetch(location.href");
    expect(html).toContain("900000");
  });

  it("retries faster than the normal cadence while the server is unreachable", () => {
    const html = renderDashPage({ events: [], tz: "UTC", now, refreshSeconds: 900 });
    // okMs = 900s, failMs capped at 60s so an outage clears quickly.
    // biome-ignore lint/security/noSecrets: markup assertion, not a credential
    expect(html).toContain("failMs=60000");
  });

  it("omits all refresh machinery when the interval is zero", () => {
    const html = renderDashPage({ events: [], tz: "UTC", now, refreshSeconds: 0 });
    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).not.toContain("fetch(location.href");
  });

  it("defaults to a ten-minute refresh", () => {
    const html = renderDashPage({ events: [], tz: "UTC", now });
    expect(html).toContain('content="600"');
    expect(html).toContain("okMs=600000");
  });

  it("shows an empty-day message when there is nothing on", () => {
    const html = renderDashPage({ events: [], tz: "UTC", now });
    expect(html).toContain("Nothing on the calendar today.");
  });

  it("truncates a long day and reports the overflow count", () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      ev(`Event ${i}`, "2026-09-14T15:00:00Z", "2026-09-14T16:00:00Z"),
    );
    const html = renderDashPage({ events, tz: "UTC", now });
    expect(html).toContain("+3 more");
    expect(html).toContain("Event 8");
    expect(html).not.toContain("Event 9");
  });

  it("escapes HTML in titles and locations", () => {
    const html = renderDashPage({
      events: [
        // biome-ignore lint/security/noSecrets: XSS probe string, not a credential
        ev("<script>alert(1)</script>", "2026-09-14T15:00:00Z", "2026-09-14T16:00:00Z", {
          location: 'Field "3" & 4',
        }),
      ],
      tz: "UTC",
      now,
    });
    // biome-ignore lint/security/noSecrets: XSS probe string, not a credential
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Field &quot;3&quot; &amp; 4");
  });

  it("uses no colour beyond black, white and the one legible grey", () => {
    const html = renderDashPage({
      events: [
        ev("Dentist", "2026-09-14T15:00:00Z", "2026-09-14T16:00:00Z", {
          assignees: [{ name: "Bob", color: "#2f6f4f" }],
        }),
      ],
      tz: "UTC",
      now,
    });
    const colours = new Set(html.match(/#[0-9a-fA-F]{3,6}/g) ?? []);
    // Measured on the PW5 panel: anything lighter than #555 washes out.
    expect([...colours].sort()).toEqual(["#000", "#555", "#fff"]);
  });
});
