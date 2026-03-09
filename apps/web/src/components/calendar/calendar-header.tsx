"use client";

import { ChevronLeft, ChevronRight, Loader2, LogOut, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

interface CalendarHeaderProps {
  title: string;
  view: "month" | "week";
  userName: string;
  onPrev: () => void;
  onNext: () => void;
  onViewChange: (view: "month" | "week") => void;
  onNewEvent?: () => void;
  onSmartInput?: (text: string) => void;
  smartInputLoading?: boolean;
}

export function CalendarHeader({
  title,
  view,
  userName,
  onPrev,
  onNext,
  onViewChange,
  onNewEvent,
  onSmartInput,
  smartInputLoading = false,
}: CalendarHeaderProps) {
  const router = useRouter();
  const [smartText, setSmartText] = useState("");

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  function handleSmartSubmit() {
    const trimmed = smartText.trim();
    if (!trimmed || !onSmartInput) return;
    onSmartInput(trimmed);
    setSmartText("");
  }

  function handleSmartKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSmartSubmit();
    }
  }

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

      {/* Center: smart input */}
      <div className="hidden items-center gap-2 md:flex">
        <Input
          value={smartText}
          onChange={(e) => setSmartText(e.target.value)}
          onKeyDown={handleSmartKeyDown}
          placeholder="e.g. Dentist next Tuesday 2pm"
          disabled={smartInputLoading}
          className="w-64"
        />
        <Button
          variant="outline"
          size="icon-sm"
          onClick={handleSmartSubmit}
          disabled={smartInputLoading || !smartText.trim()}
        >
          {smartInputLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </Button>
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
