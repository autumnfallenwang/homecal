"use client";

import type { Holiday } from "@homecal/shared";
import { cn } from "@/lib/utils";

interface HolidayKickerProps {
  holiday: Holiday;
  className?: string;
  /** Rendering density. Month cells are tighter than week/day headers. */
  variant?: "month" | "header";
}

/**
 * Read-only holiday kicker — terracotta `·` prefix + Fraunces italic
 * lowercase title. Deliberately *not* a ribbon/pill — the typographic treatment
 * matches the rest of Warm Editorial and keeps it out of the 3-pill cell budget.
 */
export function HolidayKicker({ holiday, className, variant = "month" }: HolidayKickerProps) {
  const size = variant === "header" ? "text-[11px]" : "text-[10px]";
  return (
    <div
      className={cn(
        "flex items-center gap-1 truncate font-display italic leading-none tracking-tight text-muted-foreground",
        size,
        className,
      )}
      title={`${holiday.title} — ${holiday.countries.join(", ")}`}
    >
      <span className="text-accent" aria-hidden>
        ·
      </span>
      <span className="truncate lowercase">{holiday.title}</span>
    </div>
  );
}
