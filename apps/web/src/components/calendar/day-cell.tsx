"use client";

import type { Holiday } from "@homecal/shared";
import { Plus } from "lucide-react";
import type { CalendarEvent } from "@/hooks/use-events";
import { cn } from "@/lib/utils";
import { EventDetailPopover } from "./event-detail-popover";
import { EventPill } from "./event-pill";
import { HolidayKicker } from "./holiday-kicker";

const MAX_VISIBLE_PILLS = 3;
const STAGGER_MS = 18;
const MAX_STAGGER_MS = 760;
const MS_PER_DAY = 86_400_000;

function isAllDayEvent(start: Date, end: Date): boolean {
  return (
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getTime() - start.getTime() >= MS_PER_DAY - 1000
  );
}

function formatEventTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const suffix = h < 12 ? "a" : "p";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${m.toString().padStart(2, "0")}${suffix}`;
}

interface DayCellProps {
  date: Date;
  index: number;
  events: CalendarEvent[];
  holiday?: Holiday;
  isCurrentMonth: boolean;
  isToday: boolean;
  onEventClick?: (eventId: string) => void;
  onDayClick?: (date: Date) => void;
}

export function DayCell({
  date,
  index,
  events,
  holiday,
  isCurrentMonth,
  isToday: today,
  onEventClick,
  onDayClick,
}: DayCellProps) {
  const visibleEvents = events.slice(0, MAX_VISIBLE_PILLS);
  const hiddenEvents = events.slice(MAX_VISIBLE_PILLS);
  const overflowCount = hiddenEvents.length;
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isEmpty = events.length === 0;
  const delay = Math.min(index * STAGGER_MS, MAX_STAGGER_MS);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: day cell contains interactive EventPill buttons
    // biome-ignore lint/a11y/noStaticElementInteractions: day cell is a grid cell with nested interactive buttons
    <div
      className={cn(
        "group relative min-h-28 cursor-pointer border-b border-r border-rule px-3 pt-2 pb-2 text-left transition-colors md:min-h-32 xl:min-h-40",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500",
        isWeekend && "bg-paper-warm",
        !isCurrentMonth && "opacity-50",
        today &&
          "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent",
      )}
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => onDayClick?.(date)}
    >
      {holiday && (
        <HolidayKicker
          holiday={holiday}
          variant="month"
          className="pointer-events-none absolute top-2 right-3 left-12"
        />
      )}
      <span
        className={cn(
          "font-display text-2xl font-light leading-none tracking-tight md:text-3xl",
          today && "italic font-medium text-accent",
          !isCurrentMonth && !today && "text-muted-foreground",
        )}
      >
        {date.getDate()}
      </span>
      <div className="mt-2 flex flex-col gap-0.5">
        {visibleEvents.map((event) => {
          const color = event.assignees[0]?.color ?? "#6b7280";
          const start = new Date(event.start);
          const end = new Date(event.end);
          const allDay = isAllDayEvent(start, end);
          return (
            <EventPill
              key={event.id}
              title={event.title}
              color={color}
              time={allDay ? undefined : formatEventTime(start)}
              isSeries={!!event.seriesId}
              isAllDay={allDay}
              isPrivate={event.private}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick?.(event.id);
              }}
            />
          );
        })}
        {overflowCount > 0 && (
          <EventDetailPopover
            events={hiddenEvents}
            onEventClick={onEventClick}
            heading={date.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            trigger={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 self-start rounded-full px-2 py-0.5 font-display text-[11px] italic text-accent transition-colors hover:bg-accent-soft"
              >
                +{overflowCount} more
              </button>
            }
          />
        )}
      </div>
      {isEmpty && isCurrentMonth && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        >
          <Plus className="h-5 w-5 text-muted-foreground/40" />
        </div>
      )}
    </div>
  );
}
