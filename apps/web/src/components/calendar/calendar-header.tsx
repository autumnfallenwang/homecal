"use client";

import { ChevronLeft, ChevronRight, LogOut, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

interface CalendarHeaderProps {
  title: string;
  view: "month" | "week";
  userName: string;
  onPrev: () => void;
  onNext: () => void;
  onViewChange: (view: "month" | "week") => void;
  onNewEvent?: () => void;
}

export function CalendarHeader({
  title,
  view,
  userName,
  onPrev,
  onNext,
  onViewChange,
  onNewEvent,
}: CalendarHeaderProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between border-b px-4 py-2">
      {/* Left: logo + view toggle + nav */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold">HomeCal</h1>

        <div className="flex items-center rounded-md border">
          <Button
            variant={view === "month" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-r-none"
            onClick={() => onViewChange("month")}
          >
            Month
          </Button>
          <Button
            variant={view === "week" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-l-none"
            onClick={() => onViewChange("week")}
          >
            Week
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">{title}</span>
          <Button variant="ghost" size="icon-sm" onClick={onNext}>
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
