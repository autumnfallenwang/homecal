"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { DayGrid } from "@/components/calendar/day-grid";
import { EventDialog, type ParsedEvent } from "@/components/calendar/event-dialog";
import { MemberFilter } from "@/components/calendar/member-filter";
import { MonthGrid } from "@/components/calendar/month-grid";
import { MonthGridSkeleton } from "@/components/calendar/month-grid-skeleton";
import { TodayView } from "@/components/calendar/today-view";
import { WeekGrid } from "@/components/calendar/week-grid";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { type CalendarEvent, useEvents } from "@/hooks/use-events";
import { useHolidays } from "@/hooks/use-holidays";
import { useMembers } from "@/hooks/use-members";
import { usePreferences } from "@/hooks/use-preferences";
import {
  formatDayTitle,
  formatMonthYear,
  formatWeekRange,
  getDayEnd,
  getDayStart,
  getGridEnd,
  getGridStart,
  getMonthGridDates,
  getWeekDates,
  getWeekEnd,
  getWeekStart,
} from "@/lib/calendar-utils";

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

type CalendarView = "today" | "month" | "week" | "day";
const VIEW_STORAGE_KEY = "homecal:view";

function loadInitialView(): CalendarView {
  if (typeof window === "undefined") return "today";
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (stored === "today" || stored === "month" || stored === "week" || stored === "day") {
    return stored;
  }
  return "today";
}

export default function HomePage() {
  const { session, isPending } = useAuthRedirect(true);
  const [view, setView] = useState<CalendarView>(loadInitialView);
  const [{ year, month }, setYearMonth] = useState(currentYearMonth);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [dayAnchor, setDayAnchor] = useState(() => new Date());
  const [visibleMemberIds, setVisibleMemberIds] = useState<Set<string> | null>(null);
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [parsedEvent, setParsedEvent] = useState<ParsedEvent | null>(null);
  const [smartInputLoading, setSmartInputLoading] = useState(false);
  const [imageInputLoading, setImageInputLoading] = useState(false);

  const gridDates = useMemo(() => getMonthGridDates(year, month), [year, month]);
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);

  const from = useMemo(() => {
    if (view === "today") return "";
    if (view === "month") return getGridStart(gridDates);
    if (view === "week") return getWeekStart(weekDates);
    return getDayStart(dayAnchor);
  }, [view, gridDates, weekDates, dayAnchor]);

  const to = useMemo(() => {
    if (view === "today") return "";
    if (view === "month") return getGridEnd(gridDates);
    if (view === "week") return getWeekEnd(weekDates);
    return getDayEnd(dayAnchor);
  }, [view, gridDates, weekDates, dayAnchor]);

  const { events, isLoading: eventsLoading, refetch } = useEvents(from, to);
  const { members, isLoading: membersLoading } = useMembers();
  const { prefs } = usePreferences();

  // Holiday range always has a value even in today view (where events skip
  // fetching) so the today kicker can render without a separate endpoint.
  const holidayRange = useMemo(() => {
    if (view === "today") {
      const t = new Date();
      const iso = `${t.getFullYear()}-${(t.getMonth() + 1).toString().padStart(2, "0")}-${t
        .getDate()
        .toString()
        .padStart(2, "0")}`;
      return { from: iso, to: iso };
    }
    return { from, to };
  }, [view, from, to]);
  const { holidays } = useHolidays(prefs.holidayCountries, holidayRange.from, holidayRange.to);

  // Initialize visibleMemberIds once members load
  const activeMemberIds = useMemo(() => {
    if (visibleMemberIds !== null) return visibleMemberIds;
    if (members.length > 0) return new Set(members.map((m) => m.id));
    return new Set<string>();
  }, [visibleMemberIds, members]);

  const filteredEvents = useMemo(
    () => events.filter((e) => e.assignees.some((a) => activeMemberIds.has(a.id))),
    [events, activeMemberIds],
  );

  const handlePrevMonth = useCallback(() => {
    setYearMonth((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setYearMonth((prev) => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  }, []);

  const handlePrevWeek = useCallback(() => {
    setWeekAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7));
  }, []);

  const handleNextWeek = useCallback(() => {
    setWeekAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7));
  }, []);

  const handlePrevDay = useCallback(() => {
    setDayAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1));
  }, []);

  const handleNextDay = useCallback(() => {
    setDayAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
  }, []);

  const noop = useCallback(() => {}, []);
  const navHandlers: Record<CalendarView, { prev: () => void; next: () => void }> = {
    today: { prev: noop, next: noop },
    month: { prev: handlePrevMonth, next: handleNextMonth },
    week: { prev: handlePrevWeek, next: handleNextWeek },
    day: { prev: handlePrevDay, next: handleNextDay },
  };
  const handlePrev = navHandlers[view].prev;
  const handleNext = navHandlers[view].next;

  const handleToday = useCallback(() => {
    const now = new Date();
    if (view === "month") {
      setYearMonth({ year: now.getFullYear(), month: now.getMonth() });
    } else if (view === "week") {
      setWeekAnchor(now);
    } else if (view === "day") {
      setDayAnchor(now);
    }
  }, [view]);

  const handleJumpToTomorrow = useCallback(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDayAnchor(tomorrow);
    setView("day");
  }, []);

  let headerTitle = "Today";
  // Insert a comma before the year so the shared header renderer can accent it.
  if (view === "month") headerTitle = formatMonthYear(year, month).replace(" ", ", ");
  else if (view === "week") headerTitle = formatWeekRange(weekDates);
  else if (view === "day") headerTitle = formatDayTitle(dayAnchor);

  const handleViewChange = useCallback(
    (newView: CalendarView) => {
      if (newView === view) return;
      if (newView === "week") {
        setWeekAnchor(view === "day" ? dayAnchor : new Date());
      } else if (newView === "day") {
        setDayAnchor(view === "week" ? weekAnchor : new Date());
      } else if (newView === "month") {
        // month — derive from current anchor
        const anchor = view === "week" ? weekAnchor : dayAnchor;
        setYearMonth({ year: anchor.getFullYear(), month: anchor.getMonth() });
      }
      setView(newView);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(VIEW_STORAGE_KEY, newView);
      }
    },
    [view, weekAnchor, dayAnchor],
  );

  // Persist view whenever it changes (e.g., via handleToday or future mutations).
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    }
  }, [view]);

  const handleToggleMember = useCallback(
    (memberId: string) => {
      setVisibleMemberIds((prev) => {
        const current = prev ?? new Set(members.map((m) => m.id));
        const next = new Set(current);
        if (next.has(memberId)) {
          next.delete(memberId);
        } else {
          next.add(memberId);
        }
        return next;
      });
    },
    [members],
  );

  const handleOnlyMe = useCallback(() => {
    if (!session?.user?.id) return;
    setVisibleMemberIds(new Set([session.user.id]));
  }, [session?.user?.id]);

  const handleEveryone = useCallback(() => {
    setVisibleMemberIds(new Set(members.map((m) => m.id)));
  }, [members]);

  const handleSmartInput = useCallback(async (text: string): Promise<boolean> => {
    setSmartInputLoading(true);
    try {
      const res = await fetch("/api/events/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Parse failed");
      const data = await res.json();
      setParsedEvent({
        title: data.title,
        location: data.location,
        description: data.description,
        start: data.start,
        end: data.end,
        assigneeIds: data.assigneeIds,
      });
      setDialogDate(new Date());
      return true;
    } catch (err) {
      console.error("Smart input error:", err);
      return false;
    } finally {
      setSmartInputLoading(false);
    }
  }, []);

  const handleImageInput = useCallback(
    async (image: string, mimeType: string): Promise<boolean> => {
      setImageInputLoading(true);
      try {
        const res = await fetch("/api/events/parse-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ image, mimeType }),
        });
        if (!res.ok) throw new Error("Image parse failed");
        const data = await res.json();
        setParsedEvent({
          title: data.title,
          location: data.location,
          description: data.description,
          start: data.start,
          end: data.end,
          assigneeIds: data.assigneeIds,
        });
        setDialogDate(new Date());
        return true;
      } catch (err) {
        console.error("Image input error:", err);
        return false;
      } finally {
        setImageInputLoading(false);
      }
    },
    [],
  );

  const handleIcsImport = useCallback(
    async (icsData: string): Promise<{ imported: number; skipped: number }> => {
      const res = await fetch("/api/events/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ icsData }),
      });
      if (!res.ok) throw new Error("Import failed");
      const data = await res.json();
      refetch();
      return { imported: data.imported, skipped: data.skipped };
    },
    [refetch],
  );

  const handleNewEvent = useCallback(() => {
    setDialogDate(new Date());
  }, []);

  const handleEventClick = useCallback(
    (eventId: string) => {
      const event = filteredEvents.find((e) => e.id === eventId);
      if (event) setEditEvent(event);
    },
    [filteredEvents],
  );

  const handleDayClick = useCallback((date: Date) => {
    setDialogDate(date);
  }, []);

  const handleSlotClick = useCallback((date: Date) => {
    setDialogDate(date);
  }, []);

  if (isPending || !session) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col">
      <CalendarHeader
        title={headerTitle}
        view={view}
        userName={session.user.name}
        userEmail={session.user.email}
        userColor={session.user.color ?? undefined}
        userRole={session.user.role ?? undefined}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onViewChange={handleViewChange}
        onNewEvent={handleNewEvent}
        onSmartInput={handleSmartInput}
        onImageInput={handleImageInput}
        onIcsImport={handleIcsImport}
        smartInputLoading={smartInputLoading}
        imageInputLoading={imageInputLoading}
      />
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="border-b border-rule lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
          <MemberFilter
            members={members}
            isLoading={membersLoading}
            visibleMemberIds={activeMemberIds}
            onToggle={handleToggleMember}
            onOnlyMe={handleOnlyMe}
            onEveryone={handleEveryone}
          />
        </aside>
        <main className="flex flex-1 overflow-auto p-4">
          {view === "today" && (
            <TodayView
              currentUserId={session.user.id}
              members={members}
              holidays={holidays}
              onEventClick={handleEventClick}
              onNewEvent={handleNewEvent}
              onJumpToTomorrow={handleJumpToTomorrow}
            />
          )}
          {view === "month" && eventsLoading && events.length === 0 && <MonthGridSkeleton />}
          {view === "month" && (!eventsLoading || events.length > 0) && (
            <MonthGrid
              year={year}
              month={month}
              events={filteredEvents}
              holidays={holidays}
              onEventClick={handleEventClick}
              onDayClick={handleDayClick}
            />
          )}
          {view === "week" && (
            <WeekGrid
              weekDates={weekDates}
              events={filteredEvents}
              holidays={holidays}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
            />
          )}
          {view === "day" && (
            <DayGrid
              date={dayAnchor}
              events={filteredEvents}
              holidays={holidays}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
            />
          )}
        </main>
      </div>
      <EventDialog
        date={dialogDate}
        event={editEvent}
        parsedEvent={parsedEvent}
        members={members}
        onClose={() => {
          setDialogDate(null);
          setEditEvent(null);
          setParsedEvent(null);
        }}
        onSaved={refetch}
      />
    </div>
  );
}
