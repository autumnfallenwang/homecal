"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member } from "@/hooks/use-members";
import { useToday } from "@/hooks/use-today";
import { cn } from "@/lib/utils";
import { formatHourMinute } from "./time-grid-utils";
import { TodayGlance } from "./today-glance";
import { TodayTimeline } from "./today-timeline";

const SCROLL_COMPRESS_THRESHOLD = 80;

function SunIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-accent/70"
      aria-hidden
    >
      <title>Empty day</title>
      <circle cx="60" cy="60" r="20" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * Math.PI * 2) / 12 - Math.PI / 2;
        const x1 = 60 + Math.cos(angle) * 30;
        const y1 = 60 + Math.sin(angle) * 30;
        const x2 = 60 + Math.cos(angle) * 42;
        const y2 = 60 + Math.sin(angle) * 42;
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
    </svg>
  );
}

interface TodayViewProps {
  currentUserId: string;
  members: Member[];
  onEventClick?: (eventId: string) => void;
  onNewEvent?: () => void;
  onJumpToTomorrow?: () => void;
}

function formatDayOfWeek(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long" });
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function TodayView({
  currentUserId,
  members,
  onEventClick,
  onNewEvent,
  onJumpToTomorrow,
}: TodayViewProps) {
  // Member filter — session-scoped, always starts as "just me" on mount.
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set([currentUserId]));
  const userIds = useMemo(() => [...visibleIds], [visibleIds]);
  const { data, isLoading, error } = useToday(userIds);

  const serverNow = data ? new Date(data.serverNow) : new Date();
  const todayEvents = data?.today ?? [];
  const upcoming = todayEvents.find((e) => new Date(e.end) > serverNow);

  const showTimelineSkeleton = isLoading && !data;
  const showEmptyState = !showTimelineSkeleton && todayEvents.length === 0;
  const showTimeline = !showTimelineSkeleton && todayEvents.length > 0;

  const handleToggleMember = useCallback((id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleOnlyMe = useCallback(() => {
    setVisibleIds(new Set([currentUserId]));
  }, [currentUserId]);

  const handleEveryone = useCallback(() => {
    setVisibleIds(new Set(members.map((m) => m.id)));
  }, [members]);

  // Scroll-driven compression of the hero
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onScroll = () => {
      setScrolled(node.scrollTop > SCROLL_COMPRESS_THRESHOLD);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  let subline: string;
  if (isLoading) {
    subline = "loading…";
  } else if (todayEvents.length === 0) {
    subline = "nothing on the books — enjoy the day.";
  } else if (todayEvents.length === 1) {
    subline = "one thing on the books.";
  } else {
    const nextBit = upcoming ? ` · next up at ${formatHourMinute(new Date(upcoming.start))}` : "";
    subline = `${todayEvents.length} things on the books${nextBit}.`;
  }

  return (
    <div ref={scrollRef} className="flex flex-1 flex-col overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 p-6 md:p-10 lg:p-12">
        {/* ─── Hero (compresses on scroll) ─── */}
        <header
          className={cn(
            "sticky top-0 -mx-6 -mt-6 px-6 pb-3 pt-6 transition-all md:-mx-10 md:-mt-10 md:px-10 md:pt-10 lg:-mx-12 lg:-mt-12 lg:px-12 lg:pt-12",
            scrolled &&
              "z-10 bg-background/85 backdrop-blur pb-3 pt-3 md:pt-3 lg:pt-3 shadow-[0_1px_0_var(--rule)]",
          )}
        >
          <div
            className={cn(
              "font-display text-sm italic tracking-wide text-muted-foreground transition-opacity",
              scrolled && "hidden md:block md:text-xs",
            )}
          >
            {formatDayOfWeek(serverNow.toISOString())}
          </div>
          <h1
            className={cn("font-display font-light leading-[0.9] tracking-tight transition-all")}
            style={{ fontSize: scrolled ? "1.75rem" : "clamp(3.75rem, 9vw, 8rem)" }}
          >
            {formatLongDate(serverNow.toISOString())}
            <span className="font-display italic text-accent">,</span>
          </h1>
          {!scrolled && (
            <p className="mt-3 font-display text-lg italic text-muted-foreground md:text-xl">
              {subline}
            </p>
          )}
        </header>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ─── Two-column body ─── */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Left: timeline (task 61 will polish with current-time line + popover) */}
          <section>
            <h2 className="mb-3 font-display text-xs italic uppercase tracking-widest text-muted-foreground">
              Timeline
            </h2>
            {showTimelineSkeleton && (
              <div className="space-y-2 motion-safe:animate-pulse">
                <div className="h-16 rounded-xl bg-muted" />
                <div className="h-16 rounded-xl bg-muted" />
                <div className="h-16 rounded-xl bg-muted" />
              </div>
            )}
            {showEmptyState && (
              <div className="flex flex-col items-center rounded-2xl border border-rule bg-card p-10 text-center shadow-(--shadow-card)">
                <SunIllustration />
                <p className="mt-4 font-display text-2xl font-light italic text-foreground">
                  Nothing on the books
                  <span className="text-accent">.</span>
                </p>
                <p className="mt-1 font-display text-sm italic text-muted-foreground">
                  Enjoy the day — or add something to look forward to.
                </p>
                {onNewEvent && (
                  <button
                    type="button"
                    onClick={onNewEvent}
                    className="mt-5 inline-flex h-10 items-center rounded-full bg-accent px-5 font-display text-sm italic text-accent-foreground transition-all hover:brightness-110"
                  >
                    Add your first event →
                  </button>
                )}
              </div>
            )}
            {showTimeline && (
              <TodayTimeline
                events={todayEvents}
                serverNow={serverNow}
                onEventClick={onEventClick}
              />
            )}
          </section>

          {/* Right: glance rail */}
          {data ? (
            <TodayGlance
              events={todayEvents}
              serverNow={serverNow}
              tomorrow={data.tomorrow}
              currentUserId={currentUserId}
              members={members}
              visibleIds={visibleIds}
              onToggleMember={handleToggleMember}
              onOnlyMe={handleOnlyMe}
              onEveryone={handleEveryone}
              onJumpToTomorrow={onJumpToTomorrow ?? (() => {})}
            />
          ) : (
            <aside className="flex flex-col gap-5">
              <div className="h-28 rounded-2xl bg-muted motion-safe:animate-pulse" />
              <div className="h-20 rounded-xl bg-muted motion-safe:animate-pulse" />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
