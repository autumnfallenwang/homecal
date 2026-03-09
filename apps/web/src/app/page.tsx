"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { EventDialog } from "@/components/calendar/event-dialog";
import { MemberFilter } from "@/components/calendar/member-filter";
import { MonthGrid } from "@/components/calendar/month-grid";
import { WeekGrid } from "@/components/calendar/week-grid";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { type CalendarEvent, useEvents } from "@/hooks/use-events";
import { useMembers } from "@/hooks/use-members";
import {
  formatMonthYear,
  formatWeekRange,
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
  const [view, setView] = useState<"month" | "week">("month");
  const [{ year, month }, setYearMonth] = useState(currentYearMonth);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [visibleMemberIds, setVisibleMemberIds] = useState<Set<string> | null>(null);
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);

  const gridDates = useMemo(() => getMonthGridDates(year, month), [year, month]);
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);

  const from = useMemo(
    () => (view === "month" ? getGridStart(gridDates) : getWeekStart(weekDates)),
    [view, gridDates, weekDates],
  );
  const to = useMemo(
    () => (view === "month" ? getGridEnd(gridDates) : getWeekEnd(weekDates)),
    [view, gridDates, weekDates],
  );

  const { events, refetch } = useEvents(from, to);
  const { members, isLoading: membersLoading } = useMembers();

  // Initialize visibleMemberIds once members load
  const activeMemberIds = useMemo(() => {
    if (visibleMemberIds !== null) return visibleMemberIds;
    if (members.length > 0) return new Set(members.map((m) => m.id));
    return new Set<string>();
  }, [visibleMemberIds, members]);

  const filteredEvents = useMemo(
    () => events.filter((e) => activeMemberIds.has(e.ownerId)),
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

  const handlePrev = view === "month" ? handlePrevMonth : handlePrevWeek;
  const handleNext = view === "month" ? handleNextMonth : handleNextWeek;

  const headerTitle = view === "month" ? formatMonthYear(year, month) : formatWeekRange(weekDates);

  const handleViewChange = useCallback(
    (newView: "month" | "week") => {
      if (newView === view) return;
      if (newView === "week") {
        setWeekAnchor(new Date());
      } else {
        // Set month from week anchor
        setYearMonth({ year: weekAnchor.getFullYear(), month: weekAnchor.getMonth() });
      }
      setView(newView);
    },
    [view, weekAnchor],
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
        onPrev={handlePrev}
        onNext={handleNext}
        onViewChange={handleViewChange}
        onNewEvent={handleNewEvent}
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
          {view === "month" ? (
            <MonthGrid
              year={year}
              month={month}
              events={filteredEvents}
              members={members}
              onEventClick={handleEventClick}
              onDayClick={handleDayClick}
            />
          ) : (
            <WeekGrid
              weekDates={weekDates}
              events={filteredEvents}
              members={members}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
            />
          )}
        </main>
      </div>
      <EventDialog
        date={dialogDate}
        event={editEvent}
        onClose={() => {
          setDialogDate(null);
          setEditEvent(null);
        }}
        onSaved={refetch}
      />
    </div>
  );
}
