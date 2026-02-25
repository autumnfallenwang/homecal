"use client";

import { ChevronLeft, ChevronRight, LogOut, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { formatMonthYear } from "@/lib/calendar-utils";

interface CalendarHeaderProps {
  year: number;
  month: number;
  userName: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onNewEvent?: () => void;
}

export function CalendarHeader({
  year,
  month,
  userName,
  onPrevMonth,
  onNextMonth,
  onNewEvent,
}: CalendarHeaderProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between border-b px-4 py-2">
      {/* Left: logo + month nav */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold">HomeCal</h1>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">
            {formatMonthYear(year, month)}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={onNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Right: new event + user + sign out */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onNewEvent}>
          <Plus className="mr-1 h-4 w-4" />
          New Event
        </Button>
        <span className="text-sm text-muted-foreground">{userName}</span>
        <Button variant="ghost" size="icon-sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
