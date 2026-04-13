"use client";

import type { Holiday } from "@homecal/shared";
import { type MouseEvent, useEffect, useRef } from "react";
import type { CalendarEvent } from "@/hooks/use-events";
import { isToday } from "@/lib/calendar-utils";
import { holidayKey, indexHolidaysByDate } from "@/lib/holiday-utils";
import { cn } from "@/lib/utils";
import { CurrentTimeLine } from "./current-time-line";
import { HolidayKicker } from "./holiday-kicker";
import {
  DEFAULT_SCROLL_HOUR,
  formatHourCompact,
  formatTimeRange,
  HOUR_COUNT,
  HOUR_HEIGHT,
  HOUR_START,
  hourTop,
  positionEvents,
} from "./time-grid-utils";
import { WeekEventBlock } from "./week-event-block";

interface DayGridProps {
  date: Date;
  events: CalendarEvent[];
  holidays?: Holiday[];
  onEventClick?: (eventId: string) => void;
  onSlotClick?: (date: Date) => void;
}

export function DayGrid({ date, events, holidays = [], onEventClick, onSlotClick }: DayGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = isToday(date);
  const holiday = indexHolidaysByDate(holidays).get(holidayKey(date));

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs on mount only
  useEffect(() => {
    if (!scrollRef.current) return;
    if (today) {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const topPx = ((minutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;
      const viewport = scrollRef.current.clientHeight;
      scrollRef.current.scrollTop = Math.max(0, topPx - viewport / 3);
    } else {
      scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT;
    }
  }, []);

  function handleSlotClick(e: MouseEvent<HTMLDivElement>) {
    if (!onSlotClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const hour = Math.floor(offsetY / HOUR_HEIGHT) + HOUR_START;
    const clampedHour = Math.max(HOUR_START, Math.min(hour, 23));
    const clickDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), clampedHour);
    onSlotClick(clickDate);
  }

  const positioned = positionEvents(events);
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => HOUR_START + i);
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day header */}
      <div className="grid border-b border-rule" style={{ gridTemplateColumns: "60px 1fr" }}>
        <div />
        <div className="flex flex-col items-start gap-0.5 px-3 py-3">
          <span
            className={cn(
              "font-display text-xs italic tracking-wide md:text-sm",
              today ? "text-accent" : "text-muted-foreground",
            )}
          >
            {dayName}
          </span>
          <span
            className={cn(
              "font-display text-2xl font-light leading-none tracking-tight md:text-3xl",
              today && "italic font-medium text-accent",
            )}
          >
            {date.getDate()}
          </span>
          {holiday && <HolidayKicker holiday={holiday} variant="header" className="mt-0.5" />}
        </div>
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: "60px 1fr", height: HOUR_COUNT * HOUR_HEIGHT }}
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

          {/* Day column */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: day column contains interactive event buttons */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: day column is a grid cell with nested buttons */}
          <div
            className={cn("relative", today && "bg-paper-warm/40")}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              handleSlotClick(e);
            }}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-rule/60"
                style={{ top: hourTop(hour) }}
              />
            ))}

            {today && <CurrentTimeLine />}

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
        </div>
      </div>
    </div>
  );
}
