/**
 * Routines (Phase 25): daily repeating sounds for a member — wake-up, bedtime —
 * held by the speakers that serve that member, and kept off the calendar.
 *
 * The server expands each routine into concrete occurrences (UTC instants) for
 * the next 7 days, with the household timezone, DST, public holidays, pauses
 * and skips already applied, so the phone needs no calendar logic and keeps
 * ringing for a week with the cluster down.
 */

import { type DesiredScheduleItem, deviceStatusFor, type SpeakerSound } from "@homecal/shared";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  events,
  householdDeviceMembers,
  householdDevices,
  routineRuns,
  routineSkips,
  routines,
  users,
} from "../db/schema.js";
import { type DeviceAlertFns, formatLocalTime, sendDeviceAlert } from "./device-health.js";
import { getOrCreateDigestSettings } from "./digest-settings.js";
import { getHolidays } from "./holidays.js";
import type { HouseholdDeviceRow } from "./household-devices.js";
import { addDays, localDateOf, weekdayOf, zonedTimeToUtc } from "./local-time.js";
import { registerRangHandler, registerScheduleProvider } from "./speaker-sync.js";

export type RoutineRow = typeof routines.$inferSelect;

export const HORIZON_DAYS = 7;
/** An occurrence this far in the past is still sent, so a slow sync can't drop it. */
const SEND_GRACE_MS = 2 * 60_000;
export const OFFLINE_WARNING_MS = 30 * 60_000;
export const MISSED_AFTER_MS = 5 * 60_000;
/** How far back the missed-wake-up check looks (covers an API restart). */
const MISSED_LOOKBACK_MS = 3 * 60 * 60_000;
/** Members with no holiday preference fall back to this. */
const DEFAULT_HOLIDAY_COUNTRIES = ["US"];

export function parseWeekDays(s: string): number[] {
  return s
    .split(",")
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

export interface Occurrence {
  date: string;
  at: Date;
}

/**
 * Pure expansion of one routine into occurrences whose instant falls in
 * [from, to]. Skips disabled routines, other weekdays, paused dates, one-off
 * skips, holidays (when enabled), and anything before the routine existed.
 */
export function expandRoutine(
  r: Pick<
    RoutineRow,
    "time" | "weekDays" | "enabled" | "skipHolidays" | "pausedUntil" | "createdAt"
  >,
  opts: { tz: string; from: Date; to: Date; holidays: Set<string>; skips: Set<string> },
): Occurrence[] {
  if (!r.enabled) return [];
  const days = parseWeekDays(r.weekDays);
  const out: Occurrence[] = [];
  let date = addDays(localDateOf(opts.from, opts.tz), -1);
  const last = addDays(localDateOf(opts.to, opts.tz), 1);
  while (date <= last) {
    const at = zonedTimeToUtc(date, r.time, opts.tz);
    const included =
      days.includes(weekdayOf(date)) &&
      !(r.pausedUntil && date <= r.pausedUntil) &&
      !opts.skips.has(date) &&
      !(r.skipHolidays && opts.holidays.has(date)) &&
      at >= opts.from &&
      at <= opts.to &&
      at >= r.createdAt;
    if (included) out.push({ date, at });
    date = addDays(date, 1);
  }
  return out;
}

function holidaySet(countries: string[] | null, from: Date, to: Date, tz: string): Set<string> {
  try {
    const list = getHolidays({
      countries: countries && countries.length > 0 ? countries : DEFAULT_HOLIDAY_COUNTRIES,
      from: addDays(localDateOf(from, tz), -1),
      to: addDays(localDateOf(to, tz), 1),
    });
    return new Set(list.map((h) => h.date));
  } catch {
    return new Set();
  }
}

async function skipsByRoutine(ids: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (ids.length === 0) return map;
  const rows = await db.select().from(routineSkips).where(inArray(routineSkips.routineId, ids));
  for (const s of rows) {
    const set = map.get(s.routineId) ?? new Set<string>();
    set.add(s.date);
    map.set(s.routineId, set);
  }
  return map;
}

/** Routines plus everything needed to expand them, for a set of members. */
async function loadRoutinesFor(memberIds: string[] | null) {
  const rows = await db
    .select({ routine: routines, member: users })
    .from(routines)
    .innerJoin(users, eq(routines.memberId, users.id))
    .where(memberIds ? inArray(routines.memberId, memberIds) : undefined);
  const skips = await skipsByRoutine(rows.map((r) => r.routine.id));
  return rows.map(({ routine, member }) => ({
    routine,
    member,
    skips: skips.get(routine.id) ?? new Set<string>(),
  }));
}

export function occurrencesFor(
  loaded: Awaited<ReturnType<typeof loadRoutinesFor>>[number],
  tz: string,
  from: Date,
  to: Date,
): Occurrence[] {
  const holidays = loaded.routine.skipHolidays
    ? holidaySet(loaded.member.holidayCountries, from, to, tz)
    : new Set<string>();
  return expandRoutine(loaded.routine, { tz, from, to, holidays, skips: loaded.skips });
}

// ─── Morning briefing ────────────────────────────────────────────────────────

function spokenTime(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const minute = get("minute");
  return `${get("hour")}${minute === "00" ? "" : `:${minute}`} ${get("dayPeriod")}`;
}

function joinSpoken(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * "Today: Soccer practice at 4 PM and Dentist at 5:30 PM." for one member and
 * local date. Private events are never read aloud (same rule as the digest).
 */
export function renderBriefing(
  dayEvents: { title: string; start: Date; end: Date }[],
  date: string,
  tz: string,
): string {
  if (dayEvents.length === 0) return "Nothing on the calendar today.";
  const dayStart = zonedTimeToUtc(date, "00:00", tz);
  const items = dayEvents.slice(0, 6).map((e) => {
    const startsToday = e.start >= dayStart;
    return startsToday ? `${e.title} at ${spokenTime(e.start, tz)}` : `${e.title}, all day`;
  });
  const more = dayEvents.length > 6 ? `, and ${dayEvents.length - 6} more` : "";
  return `Today: ${joinSpoken(items)}${more}.`;
}

/** Non-private events assigned to `memberId` overlapping [from, to). */
async function memberEvents(memberId: string, from: Date, to: Date) {
  const rows = await db.query.events.findMany({
    where: and(eq(events.private, false), lt(events.start, to), gt(events.end, from)),
    orderBy: events.start,
    with: { assignees: true },
  });
  return rows
    .filter((e) => e.assignees.some((a) => a.userId === memberId))
    .map((e) => ({ title: e.title, start: e.start, end: e.end }));
}

export function spokenText(
  routine: Pick<RoutineRow, "title" | "message">,
  memberName: string,
): string {
  const message = routine.message.trim();
  return message || `${memberName}, ${routine.title.toLowerCase()}.`;
}

// ─── Speaker schedule ────────────────────────────────────────────────────────

export async function servedMemberIds(deviceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: householdDeviceMembers.userId })
    .from(householdDeviceMembers)
    .where(eq(householdDeviceMembers.deviceId, deviceId));
  return rows.map((r) => r.userId);
}

export async function routineScheduleFor(
  device: HouseholdDeviceRow,
  ctx: { now: Date; tz: string },
): Promise<DesiredScheduleItem[]> {
  const members = await servedMemberIds(device.id);
  if (members.length === 0) return [];
  const loaded = await loadRoutinesFor(members);
  const from = new Date(ctx.now.getTime() - SEND_GRACE_MS);
  const to = new Date(ctx.now.getTime() + HORIZON_DAYS * 24 * 3600_000);
  const items: DesiredScheduleItem[] = [];
  const eventsByMember = new Map<string, Awaited<ReturnType<typeof memberEvents>>>();

  for (const l of loaded) {
    const occurrences = occurrencesFor(l, ctx.tz, from, to);
    if (occurrences.length === 0) continue;
    if (l.routine.includeBriefing && !eventsByMember.has(l.member.id)) {
      const horizonEnd = new Date(to.getTime() + 24 * 3600_000);
      eventsByMember.set(l.member.id, await memberEvents(l.member.id, from, horizonEnd));
    }
    for (const o of occurrences) {
      let text = spokenText(l.routine, l.member.name);
      if (l.routine.includeBriefing) {
        const dayStart = zonedTimeToUtc(o.date, "00:00", ctx.tz);
        const dayEnd = zonedTimeToUtc(addDays(o.date, 1), "00:00", ctx.tz);
        const dayEvents = (eventsByMember.get(l.member.id) ?? []).filter(
          (e) => e.start < dayEnd && e.end > dayStart,
        );
        text = `${text} ${renderBriefing(dayEvents, o.date, ctx.tz)}`;
      }
      items.push({
        id: `routine:${l.routine.id}:${o.date}`,
        kind: "routine",
        at: o.at.toISOString(),
        sound: l.routine.sound as SpeakerSound,
        text,
      });
    }
  }
  return items;
}

const ROUTINE_ID = /^routine:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/;

async function storeRoutineRang(
  device: HouseholdDeviceRow,
  r: { id: string; at: string; ok: boolean; error?: string },
) {
  const m = ROUTINE_ID.exec(r.id);
  if (!m) return;
  const [, routineId, date] = m;
  const routine = await db.query.routines.findFirst({ where: eq(routines.id, routineId) });
  if (!routine) return;
  const { timezone } = await getOrCreateDigestSettings();
  await db
    .insert(routineRuns)
    .values({
      routineId,
      deviceId: device.id,
      occurrenceDate: date,
      scheduledAt: zonedTimeToUtc(date, routine.time, timezone),
      rangAt: new Date(r.at),
      ok: r.ok,
      error: r.error ?? null,
    })
    .onConflictDoUpdate({
      target: [routineRuns.routineId, routineRuns.deviceId, routineRuns.occurrenceDate],
      set: { rangAt: new Date(r.at), ok: r.ok, error: r.error ?? null },
    });
}

registerScheduleProvider(routineScheduleFor);
registerRangHandler("routine", storeRoutineRang);

// ─── Alerts: offline before, missed after ────────────────────────────────────

async function speakersFor(memberId: string): Promise<HouseholdDeviceRow[]> {
  const links = await db
    .select({ deviceId: householdDeviceMembers.deviceId })
    .from(householdDeviceMembers)
    .where(eq(householdDeviceMembers.userId, memberId));
  if (links.length === 0) return [];
  return db
    .select()
    .from(householdDevices)
    .where(
      and(
        inArray(
          householdDevices.id,
          links.map((l) => l.deviceId),
        ),
        eq(householdDevices.kind, "speaker"),
      ),
    );
}

function getRun(routineId: string, deviceId: string, date: string) {
  return db.query.routineRuns.findFirst({
    where: and(
      eq(routineRuns.routineId, routineId),
      eq(routineRuns.deviceId, deviceId),
      eq(routineRuns.occurrenceDate, date),
    ),
  });
}

async function markRun(
  routineId: string,
  deviceId: string,
  o: Occurrence,
  set: { offlineWarnedAt?: Date; missedAlertedAt?: Date },
) {
  await db
    .insert(routineRuns)
    .values({ routineId, deviceId, occurrenceDate: o.date, scheduledAt: o.at, ...set })
    .onConflictDoUpdate({
      target: [routineRuns.routineId, routineRuns.deviceId, routineRuns.occurrenceDate],
      set,
    });
}

/**
 * Warn 30 min before an occurrence whose speaker is offline, and alert when an
 * occurrence passed 5 min ago without a successful rang report. Each fires once
 * per (routine, device, date). Returns the number of alerts sent.
 */
export async function checkRoutineAlerts(fns?: DeviceAlertFns): Promise<number> {
  const now = fns?.now?.() ?? new Date();
  const { timezone: tz } = await getOrCreateDigestSettings();
  const loaded = await loadRoutinesFor(null);
  let alerts = 0;

  for (const l of loaded) {
    const speakers = await speakersFor(l.member.id);
    if (speakers.length === 0) continue;
    const window = occurrencesFor(
      l,
      tz,
      new Date(now.getTime() - MISSED_LOOKBACK_MS),
      new Date(now.getTime() + OFFLINE_WARNING_MS),
    );
    for (const o of window) {
      for (const d of speakers) {
        if (o.at < d.createdAt) continue;
        const run = await getRun(l.routine.id, d.id, o.date);
        const label = `${l.member.name}'s ${l.routine.title} at ${formatLocalTime(o.at, tz)}`;

        if (o.at > now) {
          const offline = deviceStatusFor(d.lastSeenAt, d.offlineAfterMinutes, now) === "offline";
          if (offline && !run?.offlineWarnedAt) {
            const seen = d.lastSeenAt
              ? `last seen ${formatLocalTime(d.lastSeenAt, tz)}`
              : "never set up";
            await sendDeviceAlert(
              `HomeCal: ${label} may not ring`,
              `${d.name} is offline (${seen}). It may still ring ${l.member.name}'s ${l.routine.title} from what it already has, but it can't be confirmed.`,
              fns,
            );
            await markRun(l.routine.id, d.id, o, { offlineWarnedAt: now });
            alerts++;
          }
          continue;
        }

        const overdue = now.getTime() - o.at.getTime() >= MISSED_AFTER_MS;
        if (overdue && run?.ok !== true && !run?.missedAlertedAt) {
          const why = run?.error ? ` The speaker reported: ${run.error}.` : "";
          await sendDeviceAlert(
            `HomeCal: ${label} didn't ring`,
            `${d.name} didn't report ringing ${label}.${why}`,
            fns,
          );
          await markRun(l.routine.id, d.id, o, { missedAlertedAt: now });
          alerts++;
        }
      }
    }
  }
  return alerts;
}

// ─── Views for the admin UI ──────────────────────────────────────────────────

export interface RoutineView {
  id: string;
  memberId: string;
  memberName: string;
  title: string;
  message: string;
  time: string;
  weekDays: number[];
  sound: SpeakerSound;
  enabled: boolean;
  skipHolidays: boolean;
  includeBriefing: boolean;
  pausedUntil: string | null;
  skips: string[];
  next: { date: string; at: string } | null;
  last: { date: string; rangAt: string | null; ok: boolean | null; error: string | null } | null;
  speakers: { id: string; name: string }[];
}

export async function listRoutineViews(now = new Date()): Promise<RoutineView[]> {
  const { timezone: tz } = await getOrCreateDigestSettings();
  const loaded = await loadRoutinesFor(null);
  const today = localDateOf(now, tz);
  const views: RoutineView[] = [];
  for (const l of loaded) {
    const next = occurrencesFor(l, tz, now, new Date(now.getTime() + 31 * 24 * 3600_000))[0];
    const [last] = await db
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.routineId, l.routine.id))
      .orderBy(routineRuns.scheduledAt)
      .then((rows) => rows.filter((r) => r.scheduledAt <= now).slice(-1));
    const speakers = await speakersFor(l.member.id);
    views.push({
      id: l.routine.id,
      memberId: l.member.id,
      memberName: l.member.name,
      title: l.routine.title,
      message: l.routine.message,
      time: l.routine.time,
      weekDays: parseWeekDays(l.routine.weekDays),
      sound: l.routine.sound as SpeakerSound,
      enabled: l.routine.enabled,
      skipHolidays: l.routine.skipHolidays,
      includeBriefing: l.routine.includeBriefing,
      pausedUntil: l.routine.pausedUntil,
      skips: [...l.skips].filter((d) => d >= today).sort(),
      next: next ? { date: next.date, at: next.at.toISOString() } : null,
      last: last
        ? {
            date: last.occurrenceDate,
            rangAt: last.rangAt?.toISOString() ?? null,
            ok: last.ok,
            error: last.error,
          }
        : null,
      speakers: speakers.map((s) => ({ id: s.id, name: s.name })),
    });
  }
  return views.sort(
    (a, b) => a.memberName.localeCompare(b.memberName) || a.time.localeCompare(b.time),
  );
}

/** The next occurrence date, for "skip next". */
export async function nextOccurrenceDate(
  routineId: string,
  now = new Date(),
): Promise<string | null> {
  const { timezone: tz } = await getOrCreateDigestSettings();
  const l = (await loadRoutinesFor(null)).find((x) => x.routine.id === routineId);
  if (!l) return null;
  const next = occurrencesFor(l, tz, now, new Date(now.getTime() + 31 * 24 * 3600_000))[0];
  return next?.date ?? null;
}
