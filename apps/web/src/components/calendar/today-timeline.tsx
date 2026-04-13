"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { CalendarEvent } from "@/hooks/use-events";
import { cn } from "@/lib/utils";
import { formatHourMinute } from "./time-grid-utils";

interface TodayTimelineProps {
  events: CalendarEvent[];
  serverNow: Date;
  onEventClick?: (eventId: string) => void;
}

type EventState = "past" | "current" | "future";
const EARLIER_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2h

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "·";
}

function classifyEvent(event: CalendarEvent, now: Date): EventState {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  const nowMs = now.getTime();
  if (end <= nowMs) return "past";
  if (start <= nowMs) return "current";
  return "future";
}

interface EventCardProps {
  event: CalendarEvent;
  state: EventState;
  onClick?: () => void;
}

function EventCard({ event, state, onClick }: EventCardProps) {
  const color = event.assignees[0]?.color ?? "#6b7280";
  const start = new Date(event.start);
  const end = new Date(event.end);

  const borderStyle: React.CSSProperties = {};
  if (state === "current") {
    borderStyle.boxShadow = `inset 0 0 0 2px var(--accent)`;
  } else if (state === "future") {
    borderStyle.borderLeftColor = color;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={borderStyle}
      className={cn(
        "group/row relative flex w-full items-start gap-4 rounded-2xl bg-card p-4 text-left shadow-(--shadow-card) transition-all hover:-translate-y-px",
        state === "past" && "opacity-50",
        state === "future" && "border-l-2",
      )}
    >
      <div className="w-20 shrink-0 font-display text-sm italic tabular-nums text-muted-foreground">
        {formatHourMinute(start)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-medium leading-tight">
              {event.private ? "🔒 " : ""}
              {event.title}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
              <span>
                {formatHourMinute(start)} – {formatHourMinute(end)}
              </span>
              {event.location && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-0.5 truncate">
                    <MapPin className="h-3 w-3" />
                    {event.location}
                  </span>
                </>
              )}
            </div>
          </div>
          {state === "current" && (
            <span
              className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-accent px-2 font-display text-[10px] font-semibold uppercase tracking-widest text-accent-foreground motion-safe:animate-pulse"
              aria-live="polite"
            >
              now
            </span>
          )}
        </div>
        {event.assignees.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {event.assignees.map((a) => (
              <span
                key={a.id}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full font-display text-[10px] text-white ring-1 ring-background"
                style={{ backgroundColor: a.color }}
                title={a.name}
              >
                {initial(a.name)}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function NowLine({ now }: { now: Date }) {
  return (
    <div className="relative my-1 flex items-center gap-3" aria-hidden>
      <span className="font-display text-[11px] italic tabular-nums text-accent">
        {formatHourMinute(now)}
      </span>
      <div className="h-px flex-1 bg-accent" />
      <span className="h-[7px] w-[7px] rounded-full bg-accent motion-safe:animate-pulse" />
    </div>
  );
}

export function TodayTimeline({ events, serverNow, onEventClick }: TodayTimelineProps) {
  const [earlierExpanded, setEarlierExpanded] = useState(false);

  const { earlier, recent } = useMemo(() => {
    // Partition past events into "earlier today" (ended >2h ago) and "recent past"
    const cutoff = serverNow.getTime() - EARLIER_THRESHOLD_MS;
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    const earlierList: CalendarEvent[] = [];
    const recentList: CalendarEvent[] = [];
    for (const e of sortedEvents) {
      const end = new Date(e.end).getTime();
      if (end <= cutoff) {
        earlierList.push(e);
      } else {
        recentList.push(e);
      }
    }
    return { earlier: earlierList, recent: recentList };
  }, [events, serverNow]);

  // Find the index of the first non-past event in `recent` to insert NOW line before.
  const firstNonPastIdx = recent.findIndex((e) => classifyEvent(e, serverNow) !== "past");

  return (
    <div className="flex flex-col gap-2">
      {earlier.length > 0 && (
        <button
          type="button"
          onClick={() => setEarlierExpanded((v) => !v)}
          className="group/earlier flex items-center gap-2 rounded-full px-3 py-1.5 text-left font-display text-sm italic text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={earlierExpanded}
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform", earlierExpanded && "rotate-90")}
          />
          Earlier today
          <span className="tabular-nums">({earlier.length})</span>
        </button>
      )}
      {earlierExpanded &&
        earlier.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            state="past"
            onClick={() => onEventClick?.(event.id)}
          />
        ))}

      {recent.map((event, i) => {
        const state = classifyEvent(event, serverNow);
        const showNowLine = i === firstNonPastIdx;
        return (
          <Fragment key={event.id}>
            {showNowLine && <NowLine now={serverNow} />}
            <EventCard event={event} state={state} onClick={() => onEventClick?.(event.id)} />
          </Fragment>
        );
      })}

      {/* NOW line at the very end if every recent event is already past (shouldn't happen
          given partitioning, but defensive for the all-past-within-last-2h case) */}
      {recent.length > 0 && firstNonPastIdx === -1 && <NowLine now={serverNow} />}
    </div>
  );
}
