"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { DayGrid } from "@/components/calendar/day-grid";
import { EventDialog, type ParsedEvent } from "@/components/calendar/event-dialog";
import { MemberFilter } from "@/components/calendar/member-filter";
import { MonthGrid } from "@/components/calendar/month-grid";
import { WeekGrid } from "@/components/calendar/week-grid";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { type CalendarEvent, useEvents } from "@/hooks/use-events";
import { useMembers } from "@/hooks/use-members";
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

export default function HomePage() {
  const { session, isPending } = useAuthRedirect(true);
  const [view, setView] = useState<"month" | "week" | "day">("month");
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
    if (view === "month") return getGridStart(gridDates);
    if (view === "week") return getWeekStart(weekDates);
    return getDayStart(dayAnchor);
  }, [view, gridDates, weekDates, dayAnchor]);

  const to = useMemo(() => {
    if (view === "month") return getGridEnd(gridDates);
    if (view === "week") return getWeekEnd(weekDates);
    return getDayEnd(dayAnchor);
  }, [view, gridDates, weekDates, dayAnchor]);

  const { events, refetch } = useEvents(from, to);
  const { members, isLoading: membersLoading } = useMembers();

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

  const navHandlers = {
    month: { prev: handlePrevMonth, next: handleNextMonth },
    week: { prev: handlePrevWeek, next: handleNextWeek },
    day: { prev: handlePrevDay, next: handleNextDay },
  };
  const handlePrev = navHandlers[view].prev;
  const handleNext = navHandlers[view].next;

  const headerTitles = {
    month: formatMonthYear(year, month),
    week: formatWeekRange(weekDates),
    day: formatDayTitle(dayAnchor),
  };
  const headerTitle = headerTitles[view];

  const handleViewChange = useCallback(
    (newView: "month" | "week" | "day") => {
      if (newView === view) return;
      if (newView === "week") {
        setWeekAnchor(view === "day" ? dayAnchor : new Date());
      } else if (newView === "day") {
        setDayAnchor(view === "week" ? weekAnchor : new Date());
      } else {
        // month — derive from current anchor
        const anchor = view === "week" ? weekAnchor : dayAnchor;
        setYearMonth({ year: anchor.getFullYear(), month: anchor.getMonth() });
      }
      setView(newView);
    },
    [view, weekAnchor, dayAnchor],
  );

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
        onViewChange={handleViewChange}
        onNewEvent={handleNewEvent}
        onSmartInput={handleSmartInput}
        onImageInput={handleImageInput}
        onIcsImport={handleIcsImport}
        smartInputLoading={smartInputLoading}
        imageInputLoading={imageInputLoading}
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-60 border-r p-4 lg:block">
          <MemberFilter
            members={members}
            isLoading={membersLoading}
            visibleMemberIds={activeMemberIds}
            onToggle={handleToggleMember}
          />
        </aside>
        <main className="flex flex-1 overflow-auto p-4">
          {view === "month" && (
            <MonthGrid
              year={year}
              month={month}
              events={filteredEvents}
              onEventClick={handleEventClick}
              onDayClick={handleDayClick}
            />
          )}
          {view === "week" && (
            <WeekGrid
              weekDates={weekDates}
              events={filteredEvents}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
            />
          )}
          {view === "day" && (
            <DayGrid
              date={dayAnchor}
              events={filteredEvents}
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
