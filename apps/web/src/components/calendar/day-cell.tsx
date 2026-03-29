"use client";

import type { CalendarEvent } from "@/hooks/use-events";
import { cn } from "@/lib/utils";
import { EventPill } from "./event-pill";

const MAX_VISIBLE_PILLS = 3;

interface DayCellProps {
  date: Date;
  events: CalendarEvent[];
  isCurrentMonth: boolean;
  isToday: boolean;
  onEventClick?: (eventId: string) => void;
  onDayClick?: (date: Date) => void;
}

export function DayCell({
  date,
  events,
  isCurrentMonth,
  isToday: today,
  onEventClick,
  onDayClick,
}: DayCellProps) {
  const visibleEvents = events.slice(0, MAX_VISIBLE_PILLS);
  const overflowCount = events.length - MAX_VISIBLE_PILLS;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: day cell contains interactive EventPill buttons
    // biome-ignore lint/a11y/noStaticElementInteractions: day cell is a grid cell with nested interactive buttons
    <div
      className={cn(
        "min-h-24 cursor-pointer border-b border-r p-1 text-left",
        !isCurrentMonth && "bg-muted/30",
      )}
      onClick={() => onDayClick?.(date)}
    >
      <span
        className={cn(
          "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
          today && "bg-primary text-primary-foreground font-bold",
          !isCurrentMonth && "text-muted-foreground",
        )}
      >
        {date.getDate()}
      </span>
      <div className="flex flex-col gap-0.5">
        {visibleEvents.map((event) => {
          const color = event.assignees[0]?.color ?? "#6b7280";
          return (
            <EventPill
              key={event.id}
              title={event.title}
              color={color}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick?.(event.id);
              }}
            />
          );
        })}
        {overflowCount > 0 && (
          <span className="px-1.5 text-xs text-muted-foreground">+{overflowCount} more</span>
        )}
      </div>
    </div>
  );
}
