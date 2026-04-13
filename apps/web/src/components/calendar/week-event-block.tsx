"use client";

import type React from "react";
import { cn } from "@/lib/utils";

interface WeekEventBlockProps {
  title: string;
  timeLabel: string;
  color: string;
  isSeries?: boolean;
  top: number;
  height: number;
  left: string;
  width: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function WeekEventBlock({
  title,
  timeLabel,
  color,
  isSeries,
  top,
  height,
  left,
  width,
  onClick,
}: WeekEventBlockProps) {
  const style: React.CSSProperties = {
    top,
    height,
    left,
    width,
    backgroundColor: `color-mix(in oklab, ${color} 16%, var(--background))`,
    borderLeftColor: color,
    boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.06)",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      title={title}
      className="absolute overflow-hidden rounded-[4px] border-l-2 px-1.5 py-1 text-left text-[11.5px] leading-tight text-foreground transition-all hover:z-20 hover:ring-1 hover:ring-foreground/25"
    >
      <span
        className={cn(
          "block truncate font-medium",
          isSeries && "underline decoration-dotted underline-offset-2 decoration-foreground/40",
        )}
      >
        {title}
      </span>
      {height >= 42 && (
        <span className="mt-0.5 block truncate text-[10px] tabular-nums text-muted-foreground">
          {timeLabel}
        </span>
      )}
    </button>
  );
}
