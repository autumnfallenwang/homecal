"use client";

import { type MouseEvent, useEffect, useRef } from "react";
import type { CalendarEvent } from "@/hooks/use-events";
import { isToday } from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { CurrentTimeLine } from "./current-time-line";
import {
  DEFAULT_SCROLL_HOUR,
  dateKey,
  formatHourCompact,
  formatTimeRange,
  HOUR_COUNT,
  HOUR_HEIGHT,
  HOUR_START,
  hourTop,
  positionEvents,
} from "./time-grid-utils";
import { WeekEventBlock } from "./week-event-block";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface WeekGridProps {
  weekDates: Date[];
  events: CalendarEvent[];
  onEventClick?: (eventId: string) => void;
  onSlotClick?: (date: Date) => void;
}

export function WeekGrid({ weekDates, events, onEventClick, onSlotClick }: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Group events by day
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const start = new Date(event.start);
    const key = dateKey(start);
    const existing = eventsByDay.get(key);
    if (existing) {
      existing.push(event);
    } else {
      eventsByDay.set(key, [event]);
    }
  }

  // Auto-scroll on mount: if today is in this week, scroll so current time
  // sits ~1/3 from the top of the viewport. Otherwise default to 7am.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs on mount only
  useEffect(() => {
    if (!scrollRef.current) return;
    const todayInView = weekDates.some((d) => isToday(d));
    if (todayInView) {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const topPx = ((minutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;
      const viewport = scrollRef.current.clientHeight;
      scrollRef.current.scrollTop = Math.max(0, topPx - viewport / 3);
    } else {
      scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT;
    }
  }, []);

  function handleSlotClick(dayDate: Date, e: MouseEvent<HTMLDivElement>) {
    if (!onSlotClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const hour = Math.floor(offsetY / HOUR_HEIGHT) + HOUR_START;
    const clampedHour = Math.max(HOUR_START, Math.min(hour, 23));
    const date = new Date(
      dayDate.getFullYear(),
      dayDate.getMonth(),
      dayDate.getDate(),
      clampedHour,
    );
    onSlotClick(date);
  }

  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => HOUR_START + i);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day headers */}
      <div
        className="grid border-b border-rule"
        style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
      >
        <div />
        {weekDates.map((date, i) => {
          const today = isToday(date);
          return (
            <div
              key={date.toISOString()}
              className={cn(
                "flex flex-col items-start gap-0.5 px-3 py-3",
                i < weekDates.length - 1 && "border-r border-rule",
              )}
            >
              <span
                className={cn(
                  "font-display text-xs italic tracking-wide md:text-sm",
                  today ? "text-accent" : "text-muted-foreground",
                )}
              >
                {DAY_NAMES[i]}
              </span>
              <span
                className={cn(
                  "font-display text-2xl font-light leading-none tracking-tight md:text-3xl",
                  today && "italic font-medium text-accent",
                )}
              >
                {date.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "60px repeat(7, 1fr)",
            height: HOUR_COUNT * HOUR_HEIGHT,
          }}
        >
          {/* Time gutter */}
          <div className="relative">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 font-display text-[11px] italic tabular-nums text-ink-faint"
                style={{ top: hourTop(hour) }}
              >
                {formatHourCompact(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((date, i) => {
            const dayKey = dateKey(date);
            const dayEvents = eventsByDay.get(dayKey) ?? [];
            const positioned = positionEvents(dayEvents);
            const today = isToday(date);

            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: week column contains interactive event buttons
              // biome-ignore lint/a11y/noStaticElementInteractions: week column is a grid cell with nested buttons
              <div
                key={date.toISOString()}
                className={cn(
                  "relative",
                  i < weekDates.length - 1 && "border-r border-rule",
                  today && "bg-paper-warm/40",
                )}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  handleSlotClick(date, e);
                }}
              >
                {/* Hour grid lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-rule/60"
                    style={{ top: hourTop(hour) }}
                  />
                ))}

                {/* Current time line (only in today's column) */}
                {today && <CurrentTimeLine />}

                {/* Events */}
                {positioned.map((p) => {
                  const color = p.event.assignees[0]?.color ?? "#6b7280";
                  const startDate = new Date(p.event.start);
                  const endDate = new Date(p.event.end);
                  return (
                    <WeekEventBlock
                      key={p.event.id}
                      title={p.event.title}
                      timeLabel={formatTimeRange(startDate, endDate)}
                      isSeries={!!p.event.seriesId}
                      color={color}
                      top={p.top}
                      height={p.height}
                      left={`${(p.col / p.totalCols) * 100}%`}
                      width={`${(1 / p.totalCols) * 100}%`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(p.event.id);
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
