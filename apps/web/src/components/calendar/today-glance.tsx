"use client";

import { ChevronRight } from "lucide-react";
import type { CalendarEvent } from "@/hooks/use-events";
import type { Member } from "@/hooks/use-members";
import { MemberChip } from "./member-chip";
import { formatHourMinute } from "./time-grid-utils";

interface TomorrowPayload {
  count: number;
  firstTitle: string | null;
  hasMultiDayStart: boolean;
}

interface TodayGlanceProps {
  events: CalendarEvent[];
  serverNow: Date;
  tomorrow: TomorrowPayload;
  currentUserId: string;
  members: Member[];
  visibleIds: Set<string>;
  onToggleMember: (id: string) => void;
  onOnlyMe: () => void;
  onEveryone: () => void;
  onJumpToTomorrow: () => void;
}

/**
 * Humanize a forward time delta. Returns "starting now" / "in 42 minutes" /
 * "in 2 hours" / "in 3 days". Only forward deltas — use on upcoming events.
 */
function relativeTimeFromNow(target: Date, now: Date): string {
  const deltaMs = target.getTime() - now.getTime();
  if (deltaMs <= 60_000) return "starting now";

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 60) return rtf.format(minutes, "minute");

  const hours = Math.round(deltaMs / 3_600_000);
  if (hours < 24) return rtf.format(hours, "hour");

  const days = Math.round(deltaMs / 86_400_000);
  return rtf.format(days, "day");
}

export function TodayGlance({
  events,
  serverNow,
  tomorrow,
  currentUserId,
  members,
  visibleIds,
  onToggleMember,
  onOnlyMe,
  onEveryone,
  onJumpToTomorrow,
}: TodayGlanceProps) {
  const upcoming = events.find((e) => new Date(e.end) > serverNow);
  const forYouCount = events.filter((e) => e.assignees.some((a) => a.id === currentUserId)).length;

  const tomorrowLine = (() => {
    const parts: string[] = [];
    parts.push(`${tomorrow.count} event${tomorrow.count === 1 ? "" : "s"}`);
    if (tomorrow.firstTitle) parts.push(tomorrow.firstTitle);
    if (tomorrow.hasMultiDayStart) parts.push("multi-day begins");
    return parts.join(" · ");
  })();

  return (
    <aside className="flex flex-col gap-5">
      {/* ─── Next up ─── */}
      {upcoming && (
        <div
          className="rounded-2xl border-l-2 border-accent bg-card p-5 shadow-(--shadow-card)"
          aria-live="polite"
        >
          <div className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
            Next up
          </div>
          <div className="mt-2 text-xl font-medium leading-tight">{upcoming.title}</div>
          <div className="mt-1 flex items-baseline gap-2 text-sm">
            <span className="font-display italic tabular-nums text-muted-foreground">
              {formatHourMinute(new Date(upcoming.start))}
            </span>
            <span className="font-display italic text-accent">
              {relativeTimeFromNow(new Date(upcoming.start), serverNow)}
            </span>
          </div>
        </div>
      )}

      {/* ─── Today at a glance ─── */}
      <div className="rounded-xl border border-rule bg-paper-warm/50 p-4">
        <div className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
          Today at a glance
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-3xl font-light tabular-nums">{events.length}</span>
          <span className="font-display text-sm italic text-muted-foreground">
            event{events.length === 1 ? "" : "s"}
            {forYouCount !== events.length && (
              <>
                {" · "}
                <span className="tabular-nums">{forYouCount}</span> for you
              </>
            )}
          </span>
        </div>
      </div>

      {/* ─── Showing / member filter ─── */}
      {members.length > 0 && (
        <div className="rounded-xl border border-rule p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <div className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
              Showing
            </div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <button
                type="button"
                onClick={onOnlyMe}
                className="rounded-full px-1 transition-colors hover:text-accent"
              >
                Only me
              </button>
              <span className="opacity-50">·</span>
              <button
                type="button"
                onClick={onEveryone}
                className="rounded-full px-1 transition-colors hover:text-accent"
              >
                Everyone
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <MemberChip
                key={m.id}
                member={m}
                size="sm"
                checked={visibleIds.has(m.id)}
                onClick={() => onToggleMember(m.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Tomorrow teaser ─── */}
      {tomorrow.count > 0 && (
        <button
          type="button"
          onClick={onJumpToTomorrow}
          className="group/tom flex w-full items-center justify-between gap-3 rounded-xl border border-rule p-4 text-left transition-all hover:border-accent hover:bg-paper-warm/40"
        >
          <div className="min-w-0 flex-1">
            <div className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
              Tomorrow
            </div>
            <div className="mt-1 truncate font-display text-base italic">{tomorrowLine}</div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/tom:translate-x-0.5 group-hover/tom:text-accent" />
        </button>
      )}

      {/* Reserved slot for future ambient widgets (weather, chores, waiting-on). */}
      {/* Phase 16: populate this section. */}
    </aside>
  );
}
