"use client";

import { useEffect, useState } from "react";
import { dateTop, HOUR_HEIGHT } from "./time-grid-utils";

interface CurrentTimeLineProps {
  /** When true, also render the leftward gutter dot (week view: only today's column should). */
  showDot?: boolean;
}

/**
 * A live 1px terracotta line positioned at the current local time inside its
 * absolutely-positioned parent. Updates every 30s. The dot pulses via
 * `motion-safe:animate-pulse` so reduced-motion users see a static indicator.
 */
export function CurrentTimeLine({ showDot = true }: CurrentTimeLineProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const top = dateTop(now);
  if (top < 0 || top > HOUR_HEIGHT * 24) return null;

  return (
    <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top }} aria-hidden>
      <div className="h-px bg-accent" />
      {showDot && (
        <div className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-accent motion-safe:animate-pulse" />
      )}
    </div>
  );
}
