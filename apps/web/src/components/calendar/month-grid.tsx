"use client";

import type { CalendarEvent } from "@/hooks/use-events";
import * as calUtils from "@/lib/calendar-utils";
import { DayCell } from "./day-cell";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
      <div className="grid grid-cols-7 border-b">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="border-r px-2 py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* 6x7 grid */}
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {gridDates.map((date) => (
          <DayCell
            key={date.toISOString()}
            date={date}
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
