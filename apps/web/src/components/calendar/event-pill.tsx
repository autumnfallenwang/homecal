"use client";

import type React from "react";
import { cn } from "@/lib/utils";

interface EventPillProps {
  title: string;
  color: string;
  isSeries?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function EventPill({ title, color, isSeries, onClick }: EventPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium",
        "hover:opacity-80 transition-opacity",
      )}
      style={{
        backgroundColor: `${color}20`,
        color: color,
      }}
      title={title}
    >
      {isSeries && <span className="mr-0.5">↻</span>}
      {title}
    </button>
  );
}
