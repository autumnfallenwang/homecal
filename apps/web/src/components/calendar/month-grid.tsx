"use client";

import type { CalendarEvent } from "@/hooks/use-events";
import * as calUtils from "@/lib/calendar-utils";
import { DayCell } from "./day-cell";

const DAY_HEADERS = [
  { full: "Monday", short: "Mon", weekend: false },
  { full: "Tuesday", short: "Tue", weekend: false },
  { full: "Wednesday", short: "Wed", weekend: false },
  { full: "Thursday", short: "Thu", weekend: false },
  { full: "Friday", short: "Fri", weekend: false },
  { full: "Saturday", short: "Sat", weekend: true },
  { full: "Sunday", short: "Sun", weekend: true },
];

interface MonthGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  onEventClick?: (eventId: string) => void;
  onDayClick?: (date: Date) => void;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function MonthGrid({ year, month, events, onEventClick, onDayClick }: MonthGridProps) {
  const gridDates = calUtils.getMonthGridDates(year, month);

  // Group events by their start date (local timezone)
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

  return (
    <div className="flex flex-1 flex-col">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-rule px-1">
        {DAY_HEADERS.map((day) => (
          <div
            key={day.full}
            className={`px-4 py-3 font-display text-sm italic tracking-wide md:text-base ${
              day.weekend ? "text-accent/80" : "text-muted-foreground"
            }`}
          >
            <span className="hidden md:inline">{day.full}</span>
            <span className="md:hidden">{day.short}</span>
          </div>
        ))}
      </div>

      {/* 6x7 grid */}
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {gridDates.map((date, index) => (
          <DayCell
            key={date.toISOString()}
            date={date}
            index={index}
            events={eventsByDay.get(dateKey(date)) ?? []}
            isCurrentMonth={calUtils.isSameMonth(date, year, month)}
            isToday={calUtils.isToday(date)}
            onEventClick={onEventClick}
            onDayClick={onDayClick}
          />
        ))}
      </div>
    </div>
  );
}
