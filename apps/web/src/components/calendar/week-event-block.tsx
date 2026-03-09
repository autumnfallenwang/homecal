"use client";

import type React from "react";

interface WeekEventBlockProps {
  title: string;
  timeLabel: string;
  color: string;
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
  top,
  height,
  left,
  width,
  onClick,
}: WeekEventBlockProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute overflow-hidden rounded px-1.5 py-0.5 text-left text-xs font-medium hover:opacity-80 transition-opacity"
      style={{
        top,
        height,
        left,
        width,
        backgroundColor: `${color}20`,
        color,
      }}
      title={title}
    >
      <span className="block truncate">{title}</span>
      {height >= 48 && <span className="block truncate text-[10px] opacity-70">{timeLabel}</span>}
    </button>
  );
}
