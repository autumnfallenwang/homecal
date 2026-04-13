"use client";

import { Button } from "@/components/ui/button";

interface EmptyCalendarProps {
  onNewEvent?: () => void;
}

export function EmptyCalendar({ onNewEvent }: EmptyCalendarProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="flex max-w-md flex-col items-center text-center">
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
          className="text-accent/70"
        >
          <title>Empty calendar</title>
          <circle cx="60" cy="60" r="22" stroke="currentColor" strokeWidth="1.5" fill="none" />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * Math.PI * 2) / 12 - Math.PI / 2;
            const x1 = 60 + Math.cos(angle) * 32;
            const y1 = 60 + Math.sin(angle) * 32;
            const x2 = 60 + Math.cos(angle) * 44;
            const y2 = 60 + Math.sin(angle) * 44;
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: decorative static rays
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })}
          <path
            d="M 40 74 Q 52 80, 60 78 T 80 72"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
            opacity="0.5"
          />
        </svg>
        <h2 className="mt-6 font-display text-3xl font-light tracking-tight">
          Nothing on the books
          <span className="text-accent">.</span>
        </h2>
        <p className="mt-2 font-display text-base italic text-muted-foreground">
          Enjoy the day — or add something to look forward to.
        </p>
        {onNewEvent && (
          <Button type="button" onClick={onNewEvent} className="mt-6 rounded-full px-6">
            Add your first event
          </Button>
        )}
      </div>
    </div>
  );
}
