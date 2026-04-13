"use client";

import { MapPin } from "lucide-react";
import type React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarEvent } from "@/hooks/use-events";
import { cn } from "@/lib/utils";
import { formatHourMinute } from "./time-grid-utils";

interface EventDetailPopoverProps {
  events: CalendarEvent[];
  trigger: React.ReactNode;
  onEventClick?: (eventId: string) => void;
  align?: "start" | "center" | "end";
  heading?: string;
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "·";
}

export function EventDetailPopover({
  events,
  trigger,
  onEventClick,
  align = "start",
  heading,
}: EventDetailPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-72 rounded-xl border-rule p-2 shadow-(--shadow-card)"
      >
        {heading && (
          <div className="px-2 pb-2 pt-1 font-display text-xs italic tracking-wide text-muted-foreground">
            {heading}
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {events.map((event) => {
            const color = event.assignees[0]?.color ?? "#6b7280";
            const start = new Date(event.start);
            const time = formatHourMinute(start);
            return (
              <button
                key={event.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick?.(event.id);
                }}
                className="group/row flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-paper-warm"
              >
                <div
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium tabular-nums text-[11px] text-muted-foreground">
                      {time}
                    </span>
                    <span className={cn("truncate text-sm font-medium", event.private && "italic")}>
                      {event.private ? "🔒 " : ""}
                      {event.title}
                    </span>
                  </div>
                  {event.location && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{event.location}</span>
                    </div>
                  )}
                  {event.assignees.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {event.assignees.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full font-display text-[10px] text-white"
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
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
