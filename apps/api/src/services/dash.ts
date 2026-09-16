/**
 * E-ink dashboard rendering (Phase 22) — pure functions, no DB. Renders a
 * day's events as a self-contained HTML page for an always-on e-reader.
 *
 * Measured against a Kindle Paperwhite 11th gen (firmware 5.19.2) so the
 * constraints here are empirical, not guesses:
 *
 *  - CSS viewport is 618 x 716 at devicePixelRatio 2. Design for 618px.
 *  - The panel renders ~5 usable grey levels. The digest palette's accent
 *    (#be5a24) and muted text (#7a6f5c) both wash out to near-white; only
 *    pure black on white stays crisp at 2 metres. Hence no colour here.
 *  - Assignee colours are indistinguishable in greyscale — every member dot
 *    rendered as the same mid-grey. Members are identified by initials.
 *  - The browser's JS clock reports UTC regardless of device timezone, so
 *    every time on this page is formatted server-side from `tz`. Nothing
 *    here may depend on client-side date maths.
 *  - `<meta http-equiv="refresh">` fires reliably unattended.
 */

import { type DigestEventInput, formatLocalTimeRange } from "./digest.js";
import { getLocalParts } from "./today.js";

/** Longest run of events we render before truncating with a "+N more" line. */
const MAX_EVENTS = 9;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Up to two initials for a member, e.g. "Alice" -> "A", "Mary Jane" -> "MJ".
 * Replaces the colour dot, which is invisible on a greyscale panel.
 */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}

function localDateLabel(instant: Date, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz }).format(instant);
}

/** "9:04a" — the same lowercase style the digest and web app use. */
function stamp(instant: Date, tz: string): string {
  const p = getLocalParts(instant, tz);
  const h = Number(p.hour);
  const m = Number(p.minute);
  const suffix = h < 12 ? "a" : "p";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")}${suffix}`;
}

export function renderDashPage(opts: {
  events: DigestEventInput[];
  tz: string;
  now: Date;
  /** Seconds between unattended reloads. 0 disables the meta refresh. */
  refreshSeconds?: number;
}): string {
  const { events, tz, now, refreshSeconds = 600 } = opts;

  const weekday = escapeHtml(localDateLabel(now, tz, { weekday: "long" }));
  const monthDay = escapeHtml(localDateLabel(now, tz, { month: "long", day: "numeric" }));
  const asOf = escapeHtml(stamp(now, tz));

  const shown = events.slice(0, MAX_EVENTS);
  const overflow = events.length - shown.length;

  const rows = shown
    .map((ev) => {
      // Past events stay on the page but recede — the family still wants to
      // see what already happened today, just not to read it first.
      const past = ev.end.getTime() < now.getTime();
      const time = escapeHtml(formatLocalTimeRange(ev.start, ev.end, tz));
      const loc = ev.location ? `<div class="loc">${escapeHtml(ev.location)}</div>` : "";
      const who =
        ev.assignees.length > 0
          ? `<div class="who">${ev.assignees
              .map(
                (a) =>
                  `<span class="ini" title="${escapeHtml(a.name)}">${escapeHtml(initialsFor(a.name))}</span>`,
              )
              .join("")}</div>`
          : "";
      return `<div class="ev${past ? " past" : ""}">
  <div class="t">${time}</div>
  <div class="c"><div class="ttl">${escapeHtml(ev.title)}</div>${loc}${who}</div>
</div>`;
    })
    .join("\n");

  const body =
    shown.length === 0
      ? `<div class="empty">Nothing on the calendar today.</div>`
      : rows + (overflow > 0 ? `<div class="more">+${overflow} more</div>` : "");

  const refreshTag =
    refreshSeconds > 0 ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${refreshTag}
<title>HomeCal — ${weekday}</title>
<style>
  * { box-sizing:border-box; }
  /* Pure mono only. Every intermediate grey tested on the PW5 panel washed
     out past about 1 metre; #555 is the lightest that survives. */
  body { margin:0; background:#fff; color:#000;
         font-family:Helvetica,Arial,sans-serif; }
  .wrap { max-width:618px; margin:0 auto; padding:14px 16px 24px; }
  .head { border-bottom:3px solid #000; padding-bottom:8px; }
  .brand { font-size:12px; letter-spacing:4px; }
  .wk { font-size:16px; margin-top:6px; }
  h1 { font-size:40px; line-height:1; margin:2px 0 0; font-weight:bold; }
  .meta { font-size:13px; color:#555; margin-top:7px; }
  .ev { display:flex; gap:14px; padding:14px 0; border-bottom:1px solid #000; }
  .ev .t { flex:0 0 104px; font-size:16px; font-weight:bold; padding-top:1px; }
  .ttl { font-size:21px; font-weight:bold; line-height:1.2; }
  .loc { font-size:15px; color:#555; margin-top:3px; }
  .who { margin-top:7px; }
  /* Initials in a boxed monogram — the greyscale-safe replacement for the
     per-member colour dot used everywhere else in the app. */
  .ini { display:inline-block; min-width:26px; text-align:center;
         font-size:14px; font-weight:bold; border:2px solid #000;
         border-radius:4px; padding:1px 5px; margin-right:6px; }
  .past .t, .past .ttl { color:#555; font-weight:normal; }
  .past .ini { border-color:#555; color:#555; }
  .empty { font-size:19px; padding:26px 0; color:#555; }
  .more { font-size:15px; padding:12px 0; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div class="brand">HOMECAL</div>
      <div class="wk">${weekday}</div>
      <h1>${monthDay}</h1>
      <div class="meta">as of ${asOf}</div>
    </div>
    ${body}
  </div>
</body>
</html>`;
}
