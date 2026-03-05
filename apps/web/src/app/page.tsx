"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { EventDialog } from "@/components/calendar/event-dialog";
import { MemberFilter } from "@/components/calendar/member-filter";
import { MonthGrid } from "@/components/calendar/month-grid";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { type CalendarEvent, useEvents } from "@/hooks/use-events";
import { useMembers } from "@/hooks/use-members";
import { getGridEnd, getGridStart, getMonthGridDates } from "@/lib/calendar-utils";

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default function HomePage() {
  const { session, isPending } = useAuthRedirect(true);
  const [{ year, month }, setYearMonth] = useState(currentYearMonth);
  const [visibleMemberIds, setVisibleMemberIds] = useState<Set<string> | null>(null);
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);

  const gridDates = useMemo(() => getMonthGridDates(year, month), [year, month]);
  const from = useMemo(() => getGridStart(gridDates), [gridDates]);
  const to = useMemo(() => getGridEnd(gridDates), [gridDates]);

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

  if (isPending || !session) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col">
      <CalendarHeader
        year={year}
        month={month}
        userName={session.user.name}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
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
          <MonthGrid
            year={year}
            month={month}
            events={filteredEvents}
            members={members}
            onEventClick={handleEventClick}
            onDayClick={handleDayClick}
          />
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
