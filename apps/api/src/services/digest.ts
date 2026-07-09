/**
 * Daily digest rendering (Phase 21) — pure functions, no DB. Turns a day's
 * events into the plain-text email body. Times are formatted in the family
 * timezone via `getLocalParts` (the server has no browser zone to fall back on).
 */

import { getLocalParts } from "./today.js";

export interface DigestEventInput {
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  assignees: { name: string; color: string }[];
}

function localHM(instant: Date, tz: string): { h: number; m: number } {
  const p = getLocalParts(instant, tz);
  return { h: Number(p.hour), m: Number(p.minute) };
}

/** Mirror the web `formatHourMinute` style: "9", "9:30", lowercase a/p suffix. */
function fmt(h: number, m: number, withSuffix: boolean): string {
  const suffix = h < 12 ? "a" : "p";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const base = m === 0 ? `${hour12}` : `${hour12}:${m.toString().padStart(2, "0")}`;
  return withSuffix ? `${base}${suffix}` : base;
}

/** Local wall-clock time range in `tz`, e.g. "7:30–7:45a", "12:30–1:15p", "8:30–9p". */
export function formatLocalTimeRange(start: Date, end: Date, tz: string): string {
  const s = localHM(start, tz);
  const e = localHM(end, tz);
  const sameMeridiem = s.h < 12 === e.h < 12;
  return `${fmt(s.h, s.m, !sameMeridiem)}–${fmt(e.h, e.m, true)}`;
}

/** Format the local date label for the digest header, e.g. "Wednesday, July 8". */
function localDateLabel(now: Date, tz: string, opts: Intl.DateTimeFormatOptions): string {
  const p = getLocalParts(now, tz);
  // Anchor at noon UTC of the local date so weekday/month names are stable
  // regardless of the machine's own zone.
  const anchor = new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  return anchor.toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

/**
 * Render the digest email for a day's events. Subject + plain-text body.
 * Each event line is "time · title · [location ·] assignees" (empty parts
 * dropped). An empty day gets a friendly one-liner.
 */
export function renderDigest(opts: { events: DigestEventInput[]; tz: string; now: Date }): {
  subject: string;
  text: string;
} {
  const { events, tz, now } = opts;

  const shortDay = localDateLabel(now, tz, { weekday: "short", month: "short", day: "numeric" });
  const longDate = localDateLabel(now, tz, { weekday: "long", month: "long", day: "numeric" });
  const subject = `Today on the family calendar — ${shortDay}`;

  if (events.length === 0) {
    return {
      subject,
      text: `${longDate}\n\nNothing on the calendar today. Enjoy the day.`,
    };
  }

  const lines = events.map((ev) => {
    const parts = [formatLocalTimeRange(ev.start, ev.end, tz), ev.title];
    if (ev.location) parts.push(ev.location);
    if (ev.assignees.length > 0) parts.push(ev.assignees.map((a) => a.name).join(", "));
    return parts.join(" · ");
  });

  const count = `${events.length} event${events.length === 1 ? "" : "s"} today:`;
  return {
    subject,
    text: `${longDate}\n${count}\n\n${lines.join("\n")}`,
  };
}

// ─── HTML email (Phase 21 task 132) ───
// Email-safe HTML: table layout, inline styles, hex colors, Georgia serif — so
// it renders consistently in Gmail / Apple Mail / Outlook. Sent alongside the
// plain-text body above (which stays the fallback). Matches the approved mockup.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only let hex colors into an inline style — guards the style attribute against
 *  injection via a user's stored color value. Falls back to a neutral ink. */
function safeColor(c: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#7a6f5c";
}

function eventRowHtml(ev: DigestEventInput, tz: string, isFirst: boolean): string {
  const border = isFirst ? "" : "border-top:1px solid #e6e0d3;";
  const time = escapeHtml(formatLocalTimeRange(ev.start, ev.end, tz));
  const loc = ev.location
    ? `<div style="font-family:Arial,sans-serif;font-size:12px;color:#7a6f5c;margin-top:3px;">${escapeHtml(ev.location)}</div>`
    : "";
  const who =
    ev.assignees.length > 0
      ? `<div style="margin-top:8px;font-family:Arial,sans-serif;font-size:12px;color:#7a6f5c;">${ev.assignees
          .map(
            (a) =>
              `<span style="color:${safeColor(a.color)};">&#9679;</span>&nbsp;${escapeHtml(a.name)}`,
          )
          .join("&nbsp;&nbsp;&nbsp;")}</div>`
      : "";
  return `<tr>
        <td valign="top" width="80" style="${border}padding:13px 0;font-family:Arial,sans-serif;font-size:12px;color:#7a6f5c;white-space:nowrap;">${time}</td>
        <td valign="top" style="${border}padding:13px 0 13px 14px;">
          <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#2c2416;line-height:1.3;">${escapeHtml(ev.title)}</div>
          ${loc}${who}
        </td>
      </tr>`;
}

/** The inner digest "card" for the email — masthead, date, count, event rows.
 *  (The print page uses its own flowing layout; see renderDigestPrintPage.) */
function renderDigestCardHtml(opts: { events: DigestEventInput[]; tz: string; now: Date }): string {
  const { events, tz, now } = opts;
  const weekday = escapeHtml(localDateLabel(now, tz, { weekday: "long" }));
  const monthDay = escapeHtml(localDateLabel(now, tz, { month: "long", day: "numeric" }));
  const count = `${events.length} event${events.length === 1 ? "" : "s"} today`;

  const rows =
    events.length === 0
      ? `<tr><td style="padding:22px 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;color:#7a6f5c;">Nothing on the calendar today. Enjoy the day.</td></tr>`
      : events.map((ev, i) => eventRowHtml(ev, tz, i === 0)).join("\n");

  return `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#fbf9f3;border:1px solid #e6e0d3;border-radius:12px;">
        <tr><td style="padding:18px 30px;background-color:#f6f1e7;border-bottom:1px solid #e6e0d3;border-radius:12px 12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:4px;color:#3a3020;">HOMECAL</td></tr>
        <tr><td style="padding:28px 30px 4px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:14px;color:#7a6f5c;">${weekday}</div>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:38px;color:#2c2416;line-height:1.05;margin-top:2px;">${monthDay}</div>
          <div style="margin-top:14px;"><span style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#be5a24;background-color:#f5e7dc;border:1px solid #eaccb6;border-radius:999px;padding:4px 11px;">${count}</span></div>
        </td></tr>
        <tr><td style="padding:12px 30px 24px;border-radius:0 0 12px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
      </table>`;
}

/** Render the digest as an email-safe HTML document. */
export function renderDigestHtml(opts: {
  events: DigestEventInput[];
  tz: string;
  now: Date;
}): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background-color:#f4f1ea;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f1ea;">
    <tr><td align="center" style="padding:24px 12px;">
      ${renderDigestCardHtml(opts)}
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * A print-friendly page of the digest — opened in a browser tab, auto-opens the
 * print dialog, and hides its toolbar when printing. Unlike the email (which
 * must be table-based), this uses flowing block elements so events paginate
 * naturally across pages — each event kept whole via `break-inside: avoid`.
 */
export function renderDigestPrintPage(opts: {
  events: DigestEventInput[];
  tz: string;
  now: Date;
}): string {
  const { events, tz, now } = opts;
  const weekday = escapeHtml(localDateLabel(now, tz, { weekday: "long" }));
  const monthDay = escapeHtml(localDateLabel(now, tz, { month: "long", day: "numeric" }));
  const count = `${events.length} event${events.length === 1 ? "" : "s"} today`;
  const title = escapeHtml(`HomeCal — ${weekday}, ${monthDay}`);

  const items =
    events.length === 0
      ? `<p class="empty">Nothing on the calendar today. Enjoy the day.</p>`
      : events
          .map((ev) => {
            const time = escapeHtml(formatLocalTimeRange(ev.start, ev.end, tz));
            const loc = ev.location ? `<div class="loc">${escapeHtml(ev.location)}</div>` : "";
            const who =
              ev.assignees.length > 0
                ? `<div class="who">${ev.assignees
                    .map(
                      (a) =>
                        `<span class="m"><span class="dot" style="background:${safeColor(a.color)}"></span>${escapeHtml(a.name)}</span>`,
                    )
                    .join("")}</div>`
                : "";
            return `<div class="ev"><div class="t">${time}</div><div class="c"><div class="ttl">${escapeHtml(ev.title)}</div>${loc}${who}</div></div>`;
          })
          .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  * { box-sizing:border-box; }
  /* print-color-adjust:exact makes the browser print background colors (the
     assignee dots + count pill are drawn with background-color, which print
     engines otherwise drop). */
  body { margin:0; background:#f4f1ea; color:#2c2416; font-family:Arial,Helvetica,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .wrap { max-width:640px; margin:0 auto; padding:22px 16px 40px; }
  .toolbar { text-align:center; margin-bottom:16px; }
  .toolbar button { font-family:Georgia,'Times New Roman',serif; font-size:14px; color:#fff; background:#be5a24; border:0; border-radius:999px; padding:9px 22px; cursor:pointer; }
  .sheet { background:#fbf9f3; border:1px solid #e6e0d3; border-radius:12px; padding:26px 30px 30px; }
  .brand { font-family:Georgia,'Times New Roman',serif; font-size:13px; letter-spacing:4px; color:#3a3020; }
  .wk { font-family:Georgia,'Times New Roman',serif; font-style:italic; font-size:14px; color:#7a6f5c; margin-top:14px; }
  h1 { font-family:Georgia,'Times New Roman',serif; font-weight:400; font-size:38px; line-height:1.05; margin:2px 0 0; }
  .count { display:inline-block; margin-top:14px; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#be5a24; background:#f5e7dc; border:1px solid #eaccb6; border-radius:999px; padding:4px 11px; }
  .events { margin-top:12px; }
  .ev { display:flex; gap:16px; padding:13px 0; border-top:1px solid #e6e0d3; break-inside:avoid; page-break-inside:avoid; }
  .ev:first-child { border-top:0; }
  .ev .t { flex:0 0 88px; font-size:12px; color:#7a6f5c; white-space:nowrap; padding-top:2px; }
  .ttl { font-size:15px; font-weight:bold; }
  .loc { font-size:12px; color:#7a6f5c; margin-top:3px; }
  .who { margin-top:8px; font-size:12px; color:#7a6f5c; }
  .who .m { display:inline-flex; align-items:center; gap:5px; margin-right:14px; }
  .who .dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
  .empty { font-family:Georgia,'Times New Roman',serif; font-style:italic; font-size:15px; color:#7a6f5c; }
  @media print {
    body { background:#fff; }
    .toolbar { display:none; }
    .sheet { border:0; border-radius:0; padding:0; background:#fff; }
    @page { margin:1.4cm; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="toolbar"><button type="button" onclick="window.print()">Print</button></div>
    <div class="sheet">
      <div class="brand">HOMECAL</div>
      <div class="wk">${weekday}</div>
      <h1>${monthDay}</h1>
      <div><span class="count">${count}</span></div>
      <div class="events">${items}</div>
    </div>
  </div>
  <script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});</script>
</body>
</html>`;
}
