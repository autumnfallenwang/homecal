"use client";

import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

interface CalendarHeaderProps {
  title: string;
  view: "month" | "week" | "day";
  userName: string;
  userEmail?: string;
  userColor?: string;
  userRole?: string;
  onPrev: () => void;
  onNext: () => void;
  onViewChange: (view: "month" | "week" | "day") => void;
  onNewEvent?: () => void;
  onSmartInput?: (text: string) => void;
  onProfileSaved?: () => void;
  smartInputLoading?: boolean;
}

export function CalendarHeader({
  title,
  view,
  userName,
  userEmail,
  userColor,
  userRole,
  onPrev,
  onNext,
  onViewChange,
  onNewEvent,
  onSmartInput,
  onProfileSaved,
  smartInputLoading = false,
}: CalendarHeaderProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [smartText, setSmartText] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEmail, setProfileEmail] = useState(userEmail ?? "");
  const [profileColor, setProfileColor] = useState(userColor ?? "#3b82f6");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [profileTheme, setProfileTheme] = useState(theme);

  function openProfile() {
    setProfileEmail(userEmail ?? "");
    setProfileColor(userColor ?? "#3b82f6");
    setProfilePassword("");
    setProfileTheme(theme);
    setProfileError(null);
    setProfileOpen(true);
  }

  function handleProfileClose() {
    // Revert theme preview if not saved
    document.documentElement.classList.toggle("dark", theme === "dark");
    setProfileOpen(false);
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSaving(true);
    try {
      if (profileColor !== userColor) {
        await authClient.updateUser({ color: profileColor });
      }
      if (profileEmail !== userEmail) {
        await authClient.changeEmail({ newEmail: profileEmail });
      }
      if (profilePassword) {
        await authClient.changePassword({
          newPassword: profilePassword,
          currentPassword: "",
          revokeOtherSessions: false,
        });
      }
      // Persist theme
      setTheme(profileTheme);
      setProfileOpen(false);
      onProfileSaved?.();
      // Reload page to reflect session changes (name, color, email)
      if (profileColor !== userColor || profileEmail !== userEmail || profilePassword) {
        window.location.reload();
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  }

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

  const [listening, setListening] = useState(false);

  function handleVoiceInput() {
    // biome-ignore lint/suspicious/noExplicitAny: Web Speech API not in all TS type libs
    const w = window as any;
    const SpeechRecognitionCtor = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSmartText("Voice input not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);

    recognition.onresult = (event: { results: { 0: { 0: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript;
      setSmartText(transcript);
      if (transcript.trim() && onSmartInput) {
        onSmartInput(transcript.trim());
        setSmartText("");
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.start();
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
            className="rounded-none border-x"
            onClick={() => onViewChange("week")}
          >
            Week
          </Button>
          <Button
            variant={view === "day" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-l-none"
            onClick={() => onViewChange("day")}
          >
            Day
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
        <Button
          variant={listening ? "default" : "outline"}
          size="icon-sm"
          onClick={handleVoiceInput}
          disabled={smartInputLoading || listening}
          title={listening ? "Listening..." : "Voice input"}
        >
          {listening ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
        </Button>
      </div>

      {/* Right: new event + user + sign out */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onNewEvent}>
          <Plus className="mr-1 h-4 w-4" />
          New Event
        </Button>
        <span className="text-sm text-muted-foreground">{userName}</span>
        <Button variant="ghost" size="icon-sm" onClick={openProfile} title="Settings">
          <Settings className="h-4 w-4" />
        </Button>
        {userRole === "admin" && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push("/admin")}
            title="Admin"
          >
            <ShieldCheck className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={handleSignOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/* Profile Modal */}
      <Dialog
        open={profileOpen}
        onOpenChange={(open) => {
          if (!open) handleProfileClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Update your email, color, or password.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-color">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="profile-color"
                  type="color"
                  value={profileColor}
                  onChange={(e) => setProfileColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border"
                />
                <span className="text-sm text-muted-foreground">{profileColor}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-password">New Password</Label>
              <Input
                id="profile-password"
                type="password"
                value={profilePassword}
                onChange={(e) => setProfilePassword(e.target.value)}
                placeholder="Leave blank to keep current"
                minLength={8}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Theme</Label>
              <div className="flex items-center rounded-md border w-fit">
                <Button
                  type="button"
                  variant={profileTheme === "light" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-r-none"
                  onClick={() => {
                    setProfileTheme("light");
                    document.documentElement.classList.remove("dark");
                  }}
                >
                  Light
                </Button>
                <Button
                  type="button"
                  variant={profileTheme === "dark" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-l-none"
                  onClick={() => {
                    setProfileTheme("dark");
                    document.documentElement.classList.add("dark");
                  }}
                >
                  Dark
                </Button>
              </div>
            </div>
            {profileError && <p className="text-sm text-destructive">{profileError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleProfileClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
