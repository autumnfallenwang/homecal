"use client";

import type React from "react";
import { cn } from "@/lib/utils";

interface EventPillProps {
  title: string;
  color: string;
  time?: string;
  isSeries?: boolean;
  isAllDay?: boolean;
  isPrivate?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function EventPill({
  title,
  color,
  time,
  isSeries,
  isAllDay,
  isPrivate,
  onClick,
}: EventPillProps) {
  const style: React.CSSProperties = {
    backgroundColor: `color-mix(in oklab, ${color} 14%, var(--background))`,
    borderLeftColor: color,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={style}
      className={cn(
        "group/ev relative flex w-full items-baseline gap-1.5 overflow-hidden border-l-2 pl-2 pr-1.5 text-left text-[11.5px] leading-tight text-foreground transition-all",
        "hover:translate-x-px hover:ring-1 hover:ring-foreground/25",
        isAllDay
          ? "-mr-3 rounded-r-full rounded-l-none py-1 font-display text-[12px] italic"
          : "rounded-[3px] py-0.5",
      )}
    >
      {isPrivate && <span className="shrink-0 text-[10px]">🔒</span>}
      {time && !isAllDay && (
        <span className="shrink-0 font-medium tabular-nums text-[10px] text-muted-foreground">
          {time}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium",
          isSeries && "underline decoration-dotted underline-offset-2 decoration-foreground/40",
        )}
      >
        {title}
      </span>
    </button>
  );
}
