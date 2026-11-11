"use client";

import { cn } from "@/lib/utils";

/**
 * Round weekday chips, Monday first. Shared by the event series form and the
 * routine editor (Phase 25). The two store weekdays differently — series use
 * 0 = Monday, routines and quiet hours use 0 = Sunday (JavaScript getDay) — so
 * the caller passes the numbering with `values`.
 */
const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Value of each chip, Mon…Sun, for the two numberings in use. */
export const MONDAY_FIRST_VALUES = [0, 1, 2, 3, 4, 5, 6];
export const SUNDAY_ZERO_VALUES = [1, 2, 3, 4, 5, 6, 0];

interface WeekdayPickerProps {
  selected: Set<number>;
  onToggle: (value: number) => void;
  values?: number[];
  size?: "sm" | "md";
}

export function WeekdayPicker({
  selected,
  onToggle,
  values = MONDAY_FIRST_VALUES,
  size = "md",
}: WeekdayPickerProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {LABELS.map((label, i) => {
        const value = values[i];
        const on = selected.has(value);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(value)}
            className={cn(
              "rounded-full text-xs font-medium transition-colors",
              size === "sm" ? "h-8 w-9" : "h-9 w-10",
              on
                ? "bg-foreground text-background"
                : "border border-rule text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** "Weekdays", "Every day", "Weekends" or "Mon, Wed, Fri" for Sunday-zero values. */
export function describeWeekdays(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "Every day";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return SUNDAY_ZERO_VALUES.filter((v) => set.has(v))
    .map((v) => LABELS[SUNDAY_ZERO_VALUES.indexOf(v)])
    .join(", ");
}
