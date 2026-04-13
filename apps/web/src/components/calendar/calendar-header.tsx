"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  LogOut,
  Settings,
  ShieldCheck,
  Sun,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { QuickAddPopover } from "./quick-add-popover";

interface CalendarHeaderProps {
  title: string;
  view: "month" | "week" | "day";
  userName: string;
  userEmail?: string;
  userColor?: string;
  userRole?: string;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  onViewChange: (view: "month" | "week" | "day") => void;
  onNewEvent?: () => void;
  onSmartInput?: (text: string) => Promise<boolean>;
  onImageInput?: (image: string, mimeType: string) => Promise<boolean>;
  onIcsImport?: (icsData: string) => Promise<{ imported: number; skipped: number }>;
  onProfileSaved?: () => void;
  smartInputLoading?: boolean;
  imageInputLoading?: boolean;
}

function splitTitle(title: string): { head: string; tail: string | null } {
  const idx = title.lastIndexOf(" ");
  if (idx <= 0) return { head: title, tail: null };
  return { head: title.slice(0, idx), tail: title.slice(idx + 1) };
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
  onToday,
  onViewChange,
  onNewEvent,
  onSmartInput,
  onImageInput,
  onIcsImport,
  onProfileSaved,
  smartInputLoading = false,
  imageInputLoading = false,
}: CalendarHeaderProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const icsInputRef = useRef<HTMLInputElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEmail, setProfileEmail] = useState(userEmail ?? "");
  const [profileColor, setProfileColor] = useState(userColor ?? "#3b82f6");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const { head, tail } = splitTitle(title);
  const initial = userName.trim().charAt(0).toUpperCase() || "·";

  function openProfile() {
    setProfileEmail(userEmail ?? "");
    setProfileColor(userColor ?? "#3b82f6");
    setProfilePassword("");
    setProfileError(null);
    setProfileOpen(true);
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
      setProfileOpen(false);
      onProfileSaved?.();
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

  const handleExport = () => {
    window.location.href = "/api/events/export.ics";
  };

  const handleImportClick = () => {
    icsInputRef.current?.click();
  };

  const handleIcsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onIcsImport) return;
    const text = await file.text();
    await onIcsImport(text);
    if (icsInputRef.current) icsInputRef.current.value = "";
  };

  const segButton = (value: "month" | "week" | "day", label: string) => (
    <button
      type="button"
      onClick={() => onViewChange(value)}
      className={`rounded-full px-4 py-1.5 text-xs font-medium tracking-wide transition-colors ${
        view === value
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <header className="border-b">
      {/* ─── Brand row ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <span className="font-display text-2xl italic tracking-tight">
          home<span className="not-italic font-medium">cal</span>
          <span className="text-accent">.</span>
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-full p-1 pr-3 transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Account menu"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full font-display text-base text-white"
                style={{ backgroundColor: userColor ?? "oklch(0.58 0.16 45)" }}
              >
                {initial}
              </span>
              <span className="hidden text-sm font-medium sm:inline">{userName}</span>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:inline" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="pb-2">
              <div className="font-display text-base leading-tight">{userName}</div>
              {userEmail && <div className="mt-0.5 text-xs text-muted-foreground">{userEmail}</div>}
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun className="h-4 w-4" />
                <span>Appearance</span>
                <span className="ml-auto text-xs text-muted-foreground capitalize">{theme}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(v) => setTheme(v as "light" | "dark")}
                >
                  <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={openProfile}>
              <Settings className="h-4 w-4" />
              Account settings
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export calendar
            </DropdownMenuItem>
            {onIcsImport && (
              <DropdownMenuItem onClick={handleImportClick}>
                <Upload className="h-4 w-4" />
                Import .ics
              </DropdownMenuItem>
            )}

            {userRole === "admin" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/admin")}>
                  <ShieldCheck className="h-4 w-4" />
                  Admin
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ─── Toolbar row ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-5 md:flex-nowrap">
        <h1
          key={title}
          className="font-display text-4xl font-light leading-none tracking-tight text-foreground md:text-5xl lg:text-6xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 motion-safe:duration-300"
        >
          {head}
          <span className="font-light not-italic text-accent">,</span>
          {tail && (
            <span className="ml-3 font-display text-lg italic text-muted-foreground">{tail}</span>
          )}
        </h1>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-full border bg-background p-0.5">
            {segButton("day", "Day")}
            {segButton("week", "Week")}
            {segButton("month", "Month")}
          </div>

          <div className="inline-flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onPrev}
              className="rounded-full"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {onToday && (
              <Button
                variant="outline"
                size="sm"
                onClick={onToday}
                className="font-display italic text-sm rounded-full px-4"
              >
                Today
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onNext}
              className="rounded-full"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {onSmartInput && onImageInput && onIcsImport && onNewEvent && (
            <QuickAddPopover
              onSmartInput={onSmartInput}
              onImageInput={onImageInput}
              onIcsImport={onIcsImport}
              smartInputLoading={smartInputLoading}
              imageInputLoading={imageInputLoading}
              onNewEvent={onNewEvent}
            />
          )}
        </div>
      </div>

      {/* Hidden file input for dropdown Import action */}
      <input
        ref={icsInputRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={handleIcsFileChange}
      />

      {/* Settings Modal (theme moved to dropdown; email/color/password only) */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-light tracking-tight">
              Account settings
              <span className="font-display italic text-accent">,</span>
            </DialogTitle>
            <DialogDescription>Update your email, color, or password.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-5">
            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="profile-email"
                    className="font-display text-xs italic tracking-wide text-muted-foreground"
                  >
                    Email
                  </Label>
                  <Input
                    id="profile-email"
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="profile-password"
                    className="font-display text-xs italic tracking-wide text-muted-foreground"
                  >
                    New password
                  </Label>
                  <Input
                    id="profile-password"
                    type="password"
                    value={profilePassword}
                    onChange={(e) => setProfilePassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                    minLength={8}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="profile-color"
                  className="font-display text-xs italic tracking-wide text-muted-foreground"
                >
                  Your color
                </Label>
                <div className="flex items-center gap-3 rounded-lg border border-rule bg-paper-warm/50 p-3">
                  <span
                    className="h-10 w-10 rounded-full ring-1 ring-rule"
                    style={{ backgroundColor: profileColor }}
                    aria-hidden
                  />
                  <div className="flex flex-col gap-1">
                    <input
                      id="profile-color"
                      type="color"
                      value={profileColor}
                      onChange={(e) => setProfileColor(e.target.value)}
                      className="h-7 w-16 cursor-pointer rounded border border-rule bg-background"
                    />
                    <span className="tabular-nums text-[11px] text-muted-foreground">
                      {profileColor}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {profileError && <p className="text-sm text-destructive">{profileError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={profileSaving} className="rounded-full px-5">
                {profileSaving ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
