"use client";

import { type MouseEvent, useEffect, useRef } from "react";
import type { CalendarEvent } from "@/hooks/use-events";
import type { Member } from "@/hooks/use-members";
import { isToday } from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { WeekEventBlock } from "./week-event-block";

const HOUR_START = 0;
const HOUR_END = 24;
const HOUR_COUNT = HOUR_END - HOUR_START;
const DEFAULT_SCROLL_HOUR = 7;
const HOUR_HEIGHT = 48;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface WeekGridProps {
  weekDates: Date[];
  events: CalendarEvent[];
  members: Member[];
  onEventClick?: (eventId: string) => void;
  onSlotClick?: (date: Date) => void;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatTimeRange(start: Date, end: Date): string {
  const fmt = (d: Date) => {
    const h = d.getHours();
    const m = d.getMinutes();
    const suffix = h >= 12 ? "p" : "a";
    let hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    return m > 0 ? `${hour12}:${m.toString().padStart(2, "0")}${suffix}` : `${hour12}${suffix}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  col: number;
  totalCols: number;
}

function positionEvents(dayEvents: CalendarEvent[]): PositionedEvent[] {
  if (dayEvents.length === 0) return [];

  const sorted = [...dayEvents].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const positioned: PositionedEvent[] = [];
  const columns: { end: number }[] = [];

  for (const event of sorted) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    const top = ((startMinutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;
    const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 12);

    // Find first available column
    let col = 0;
    while (col < columns.length && columns[col].end > startMinutes) {
      col++;
    }

    if (col < columns.length) {
      columns[col].end = endMinutes;
    } else {
      columns.push({ end: endMinutes });
    }

    positioned.push({ event, top, height, col, totalCols: 0 });
  }

  // Set totalCols for all events in this day
  const totalCols = columns.length;
  for (const p of positioned) {
    p.totalCols = totalCols;
  }

  return positioned;
}

export function WeekGrid({ weekDates, events, members, onEventClick, onSlotClick }: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const memberColorMap = new Map(members.map((m) => [m.id, m.color]));

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

  // Auto-scroll to ~7 AM on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT;
  }, []);

  function handleSlotClick(dayDate: Date, e: MouseEvent<HTMLDivElement>) {
    if (!onSlotClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const hour = Math.floor(offsetY / HOUR_HEIGHT) + HOUR_START;
    const clampedHour = Math.max(HOUR_START, Math.min(hour, HOUR_END - 1));
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
      <div className="grid border-b" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
        <div className="border-r" />
        {weekDates.map((date, i) => (
          <div
            key={date.toISOString()}
            className={cn("border-r px-2 py-1 text-center", isToday(date) && "bg-primary/5")}
          >
            <div className="text-xs text-muted-foreground">{DAY_NAMES[i]}</div>
            <div
              className={cn(
                "text-sm font-medium",
                isToday(date) &&
                  "mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
              )}
            >
              {date.getDate()}
            </div>
          </div>
        ))}
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
          <div className="relative border-r">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground"
                style={{ top: (hour - HOUR_START) * HOUR_HEIGHT }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((date) => {
            const dayKey = dateKey(date);
            const dayEvents = eventsByDay.get(dayKey) ?? [];
            const positioned = positionEvents(dayEvents);

            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: week column contains interactive event buttons
              // biome-ignore lint/a11y/noStaticElementInteractions: week column is a grid cell with nested buttons
              <div
                key={date.toISOString()}
                className={cn("relative border-r", isToday(date) && "bg-primary/5")}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  handleSlotClick(date, e);
                }}
              >
                {/* Hour grid lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-border/50"
                    style={{ top: (hour - HOUR_START) * HOUR_HEIGHT }}
                  />
                ))}

                {/* Events */}
                {positioned.map((p) => {
                  const color = memberColorMap.get(p.event.ownerId) ?? "#6b7280";
                  const startDate = new Date(p.event.start);
                  const endDate = new Date(p.event.end);
                  return (
                    <WeekEventBlock
                      key={p.event.id}
                      title={p.event.title}
                      timeLabel={formatTimeRange(startDate, endDate)}
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
