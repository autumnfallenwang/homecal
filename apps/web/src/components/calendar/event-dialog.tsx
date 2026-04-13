"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ChangeLog } from "@/components/calendar/change-log";
import { MemberChip } from "@/components/calendar/member-chip";
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
import { Switch } from "@/components/ui/switch";
import { useEventLogs } from "@/hooks/use-event-logs";
import type { CalendarEvent } from "@/hooks/use-events";
import type { Member } from "@/hooks/use-members";
import { generateSeriesDates, type SeriesOccurrence } from "@/lib/series-utils";
import { cn } from "@/lib/utils";

export interface ParsedEvent {
  title: string;
  location?: string;
  description?: string;
  start: string;
  end: string;
  assigneeIds?: string[];
}

interface EventDialogProps {
  date: Date | null;
  event: CalendarEvent | null;
  parsedEvent?: ParsedEvent | null;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}

function toLocalDatetime(date: Date, hours: number): string {
  const d = new Date(date);
  d.setHours(hours, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const REMINDER_PRESETS = [
  { minutes: 15, label: "15 min before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function EventDialog({
  date,
  event,
  parsedEvent,
  members,
  onClose,
  onSaved,
}: EventDialogProps) {
  // Shared fields
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [reminderMinutes, setReminderMinutes] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Single event fields
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Series fields
  const [createMode, setCreateMode] = useState<"single" | "series">("single");
  const [seriesStartDate, setSeriesStartDate] = useState("");
  const [seriesEndDate, setSeriesEndDate] = useState("");
  const [seriesStartTime, setSeriesStartTime] = useState("09:00");
  const [seriesEndTime, setSeriesEndTime] = useState("10:00");
  const [repeatEvery, setRepeatEvery] = useState(1);
  const [repeatUnit, setRepeatUnit] = useState<"days" | "weeks" | "months">("weeks");
  const [weekDays, setWeekDays] = useState<Set<number>>(new Set());
  const [monthDay, setMonthDay] = useState(1);
  const [previewDates, setPreviewDates] = useState<SeriesOccurrence[] | null>(null);
  const [seriesEditMode, setSeriesEditMode] = useState<"single" | "series" | null>(null);

  const { logs, isLoading: logsLoading } = useEventLogs(event?.id ?? null);

  const isCreate = date !== null && event === null;
  const isEdit = event !== null;
  const isSeriesEvent = isEdit && !!event?.seriesId;
  const open = isCreate || isEdit;
  const isSeries = isCreate && createMode === "series";
  const isSeriesEdit = isSeriesEvent && seriesEditMode === "series";

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      onClose();
      resetForm();
    }
  }

  function resetForm() {
    setTitle("");
    setLocation("");
    setDescription("");
    setStart("");
    setEnd("");
    setIsPrivate(false);
    setAssigneeIds([]);
    setReminderMinutes(new Set());
    setError(null);
    setSaving(false);
    setConfirmingDelete(false);
    setCreateMode("single");
    setSeriesStartDate("");
    setSeriesEndDate("");
    setSeriesStartTime("09:00");
    setSeriesEndTime("10:00");
    setRepeatEvery(1);
    setRepeatUnit("weeks");
    setWeekDays(new Set());
    setMonthDay(1);
    setPreviewDates(null);
    setSeriesEditMode(null);
  }

  // Pre-fill from smart input
  useEffect(() => {
    if (parsedEvent && date && !event) {
      setTitle(parsedEvent.title);
      setLocation(parsedEvent.location ?? "");
      setDescription(parsedEvent.description ?? "");
      setStart(parsedEvent.start.slice(0, 16));
      setEnd(parsedEvent.end.slice(0, 16));
      if (parsedEvent.assigneeIds?.length) {
        setAssigneeIds(parsedEvent.assigneeIds);
      }
    }
  }, [parsedEvent, date, event]);

  // Set defaults when creating
  useEffect(() => {
    if (date && !event && !parsedEvent) {
      const hours = date.getHours();
      const startHour = hours > 0 ? hours : 9;
      setStart(toLocalDatetime(date, startHour));
      setEnd(toLocalDatetime(date, startHour + 1));
      setSeriesStartDate(toDateString(date));
      // Default end date: 1 month from start
      const endDate = new Date(date);
      endDate.setMonth(endDate.getMonth() + 1);
      setSeriesEndDate(toDateString(endDate));
    }
  }, [date, event, parsedEvent]);

  // Pre-populate form when editing
  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setLocation(event.location ?? "");
      setDescription(event.description ?? "");
      setStart(isoToLocalDatetime(event.start));
      setEnd(isoToLocalDatetime(event.end));
      setIsPrivate(event.private);
      setAssigneeIds(event.assignees.map((a) => a.id));
      setReminderMinutes(
        new Set(event.reminders.filter((r) => r.channel === "email").map((r) => r.minutesBefore)),
      );
      // Series event: default to single edit, toggle to series
      if (event.seriesId) {
        setSeriesEditMode("single");
      }
    }
  }, [event]);

  async function loadSeriesConfig() {
    if (!event?.seriesId) return;
    try {
      const res = await fetch(`/api/series/${event.seriesId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load series config");
      const config = await res.json();
      setSeriesStartDate(config.startDate);
      setSeriesEndDate(config.endDate);
      setSeriesStartTime(config.startTime);
      setSeriesEndTime(config.endTime);
      setRepeatEvery(config.repeatEvery);
      setRepeatUnit(config.repeatUnit);
      if (config.weekDays) {
        setWeekDays(new Set(config.weekDays.split(",").map(Number)));
      }
      if (config.monthDay) {
        setMonthDay(config.monthDay);
      }
      setSeriesEditMode("series");
    } catch {
      setError("Failed to load series configuration");
    }
  }

  function toggleReminder(minutes: number) {
    setReminderMinutes((prev) => {
      const next = new Set(prev);
      if (next.has(minutes)) {
        next.delete(minutes);
      } else {
        next.add(minutes);
      }
      return next;
    });
  }

  function toggleWeekDay(day: number) {
    setWeekDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  function handlePreview() {
    setError(null);
    if (!seriesStartDate || !seriesEndDate) {
      setError("Start and end dates are required");
      return;
    }
    if (repeatUnit === "weeks" && weekDays.size === 0) {
      setError("Select at least one day of the week");
      return;
    }
    const dates = generateSeriesDates({
      startDate: seriesStartDate,
      endDate: seriesEndDate,
      startTime: seriesStartTime,
      endTime: seriesEndTime,
      repeatEvery,
      repeatUnit,
      weekDays: [...weekDays],
      monthDay,
    });
    if (dates.length === 0) {
      setError("No events would be created with these settings");
      return;
    }
    setPreviewDates(dates);
  }

  async function handleSeriesUpdate() {
    setError(null);
    setSaving(true);
    try {
      if (!previewDates || !event?.seriesId) return;

      // 1. Update series config
      await fetch(`/api/series/${event.seriesId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          startDate: seriesStartDate,
          endDate: seriesEndDate,
          startTime: seriesStartTime,
          endTime: seriesEndTime,
          repeatEvery,
          repeatUnit,
          weekDays: repeatUnit === "weeks" ? [...weekDays].join(",") : null,
          monthDay: repeatUnit === "months" ? monthDay : null,
        }),
      });

      // 2. Delete all old events in the series
      await fetch(`/api/events/series/${event.seriesId}`, {
        method: "DELETE",
        credentials: "include",
      });

      // 3. Create new events
      for (const occ of previewDates) {
        const body = {
          title,
          location: location || undefined,
          description: description || undefined,
          start: occ.start.toISOString(),
          end: occ.end.toISOString(),
          private: isPrivate,
          seriesId: event.seriesId,
          ...(assigneeIds.length > 0 ? { assigneeIds } : {}),
        };

        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `Failed to create event (${res.status})`);
        }

        if (reminderMinutes.size > 0) {
          const eventData = await res.json().catch(() => null);
          if (eventData?.id) {
            for (const minutes of reminderMinutes) {
              await fetch(`/api/events/${eventData.id}/reminders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ minutesBefore: minutes, channel: "email" }),
              });
            }
          }
        }
      }

      onSaved();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleSeriesCreate() {
    setError(null);
    setSaving(true);
    try {
      if (!previewDates) return;

      // 1. Create series config record
      const seriesRes = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          startDate: seriesStartDate,
          endDate: seriesEndDate,
          startTime: seriesStartTime,
          endTime: seriesEndTime,
          repeatEvery,
          repeatUnit,
          weekDays: repeatUnit === "weeks" ? [...weekDays].join(",") : null,
          monthDay: repeatUnit === "months" ? monthDay : null,
        }),
      });
      if (!seriesRes.ok) throw new Error("Failed to create series config");
      const seriesRecord = await seriesRes.json();

      // 2. Create individual events referencing the series
      for (const occ of previewDates) {
        const body = {
          title,
          location: location || undefined,
          description: description || undefined,
          start: occ.start.toISOString(),
          end: occ.end.toISOString(),
          private: isPrivate,
          seriesId: seriesRecord.id,
          ...(assigneeIds.length > 0 ? { assigneeIds } : {}),
        };

        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `Failed to create event (${res.status})`);
        }

        // Add reminders for each event
        if (reminderMinutes.size > 0) {
          const eventData = await res.json().catch(() => null);
          if (eventData?.id) {
            for (const minutes of reminderMinutes) {
              await fetch(`/api/events/${eventData.id}/reminders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ minutesBefore: minutes, channel: "email" }),
              });
            }
          }
        }
      }

      onSaved();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (isSeriesEvent && event.seriesId) {
        // Bulk update shared fields across all series events
        const seriesBody = {
          title,
          location: location || undefined,
          description: description || undefined,
          private: isPrivate,
        };
        const seriesRes = await fetch(`/api/events/series/${event.seriesId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(seriesBody),
        });
        if (!seriesRes.ok) {
          const data = await seriesRes.json().catch(() => null);
          throw new Error(data?.error ?? `Failed to update series (${seriesRes.status})`);
        }

        // Update this event's individual time
        const timeBody = {
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
        };
        const timeRes = await fetch(`/api/events/${event.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(timeBody),
        });
        if (!timeRes.ok) {
          const data = await timeRes.json().catch(() => null);
          throw new Error(data?.error ?? `Failed to update event time (${timeRes.status})`);
        }
      } else {
        const body = {
          title,
          location: location || undefined,
          description: description || undefined,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          private: isPrivate,
          ...(assigneeIds.length > 0 ? { assigneeIds } : {}),
        };

        const url = isEdit ? `/api/events/${event.id}` : "/api/events";
        const method = isEdit ? "PATCH" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });

        const responseData = await res.json().catch(() => null);

        if (!res.ok) {
          const action = isEdit ? "update" : "create";
          throw new Error(responseData?.error ?? `Failed to ${action} event (${res.status})`);
        }

        // Sync reminders for non-series events
        const eventId = isEdit ? event.id : responseData?.id;
        if (eventId) {
          const originalMinutes = new Set(
            event?.reminders.filter((r) => r.channel === "email").map((r) => r.minutesBefore) ?? [],
          );
          for (const r of event?.reminders ?? []) {
            if (r.channel === "email" && !reminderMinutes.has(r.minutesBefore)) {
              await fetch(`/api/events/${eventId}/reminders/${r.id}`, {
                method: "DELETE",
                credentials: "include",
              });
            }
          }
          for (const minutes of reminderMinutes) {
            if (!originalMinutes.has(minutes)) {
              await fetch(`/api/events/${eventId}/reminders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ minutesBefore: minutes, channel: "email" }),
              });
            }
          }
        }
      }

      onSaved();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(deleteSeries = false) {
    if (!event) return;
    setError(null);
    setSaving(true);
    try {
      const url =
        deleteSeries && event.seriesId
          ? `/api/events/series/${event.seriesId}`
          : `/api/events/${event.id}`;
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Failed to delete (${res.status})`);
      }
      onSaved();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  // --- Preview view (create or series edit) ---
  if ((isSeries || isSeriesEdit) && previewDates) {
    const isEditingSeries = isSeriesEdit;
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-light tracking-tight">
              {isEditingSeries ? "Update series" : "Create series"}
              <span className="font-display italic text-accent">,</span>
              <span className="ml-2 font-display text-lg italic text-muted-foreground">
                preview
              </span>
            </DialogTitle>
            <DialogDescription>
              {isEditingSeries
                ? `This will replace all events in the series with ${previewDates.length} new events for "${title}"`
                : `This will create ${previewDates.length} events for "${title}"`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-md border border-rule p-3">
            <div className="flex flex-col gap-1 text-sm">
              {previewDates.map((occ, i) => (
                <div key={occ.start.toISOString()} className="flex items-center gap-2">
                  <span className="w-6 text-right font-display italic text-muted-foreground">
                    {i + 1}.
                  </span>
                  <span>
                    {occ.start.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {occ.start.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {occ.end.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewDates(null)}>
              Back
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={isEditingSeries ? handleSeriesUpdate : handleSeriesCreate}
            >
              {saving && "Saving..."}
              {!saving && isEditingSeries && `Update ${previewDates.length} events`}
              {!saving && !isEditingSeries && `Create ${previewDates.length} events`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Main form ---
  const twoCol = !isSeries && !isSeriesEdit;
  let headerLabel = "New event";
  if (isSeriesEdit) headerLabel = "Edit entire series";
  else if (isEdit) headerLabel = "Edit event";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-light tracking-tight">
            {headerLabel}
            <span className="font-display italic text-accent">,</span>
          </DialogTitle>
          <DialogDescription>
            {isSeriesEdit && "Update the series settings and regenerate all events."}
            {isEdit && !isSeriesEdit && "Update or delete this event."}
            {!isEdit && "Create a new calendar event."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={
            isSeries || isSeriesEdit
              ? (e) => {
                  e.preventDefault();
                  handlePreview();
                }
              : handleSubmit
          }
          className="flex flex-col gap-5"
        >
          {/* Mode toggle */}
          {isCreate && (
            <div className="inline-flex items-center gap-0.5 self-start rounded-full border border-rule bg-background p-0.5">
              {(["single", "series"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCreateMode(m)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-medium capitalize tracking-wide transition-colors",
                    createMode === m
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          {isSeriesEvent && (
            <div className="inline-flex items-center gap-0.5 self-start rounded-full border border-rule bg-background p-0.5">
              <button
                type="button"
                onClick={() => setSeriesEditMode("single")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-medium tracking-wide transition-colors",
                  seriesEditMode === "single"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                This event
              </button>
              <button
                type="button"
                onClick={() => {
                  if (seriesEditMode !== "series") void loadSeriesConfig();
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-medium tracking-wide transition-colors",
                  seriesEditMode === "series"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Entire series
              </button>
            </div>
          )}

          {/* Hero title input — Fraunces, bottom-border only */}
          <div className="flex flex-col">
            <input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
              className="w-full border-0 border-b border-rule bg-transparent px-0 pb-2 font-display text-2xl leading-tight tracking-tight text-foreground outline-none transition-colors placeholder:italic placeholder:text-muted-foreground/60 focus:border-accent"
            />
          </div>

          {/* Body grid — 2 cols on md+ for single events, 1 col for series */}
          <div className={cn("grid gap-x-6 gap-y-5", twoCol && "md:grid-cols-2")}>
            {/* ─── Left column (or full width in series) ─── */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="event-location"
                  className="font-display text-xs italic tracking-wide text-muted-foreground"
                >
                  Location
                </Label>
                <Input
                  id="event-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              {isSeries || isSeriesEdit ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
                        Start date
                      </Label>
                      <Input
                        type="date"
                        value={seriesStartDate}
                        onChange={(e) => setSeriesStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
                        End date
                      </Label>
                      <Input
                        type="date"
                        value={seriesEndDate}
                        min={seriesStartDate}
                        onChange={(e) => setSeriesEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
                        Start time
                      </Label>
                      <Input
                        type="time"
                        value={seriesStartTime}
                        onChange={(e) => setSeriesStartTime(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
                        End time
                      </Label>
                      <Input
                        type="time"
                        value={seriesEndTime}
                        min={seriesStartTime}
                        onChange={(e) => setSeriesEndTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
                      Repeat
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Every</span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={repeatEvery}
                        onChange={(e) => setRepeatEvery(Number(e.target.value) || 1)}
                        className="w-16 tabular-nums"
                      />
                      <select
                        value={repeatUnit}
                        onChange={(e) =>
                          setRepeatUnit(e.target.value as "days" | "weeks" | "months")
                        }
                        className="rounded-md border border-rule bg-background px-3 py-2 text-sm"
                      >
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                      </select>
                    </div>
                  </div>

                  {repeatUnit === "weeks" && (
                    <div className="flex flex-col gap-1.5">
                      <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
                        On days
                      </Label>
                      <div className="flex gap-1">
                        {DAY_LABELS.map((label, i) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleWeekDay(i)}
                            className={cn(
                              "h-9 w-10 rounded-full text-xs font-medium transition-colors",
                              weekDays.has(i)
                                ? "bg-foreground text-background"
                                : "border border-rule text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {repeatUnit === "months" && (
                    <div className="flex items-center gap-2">
                      <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
                        On day
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={monthDay}
                        onChange={(e) => setMonthDay(Number(e.target.value) || 1)}
                        className="w-16 tabular-nums"
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="event-start"
                      className="font-display text-xs italic tracking-wide text-muted-foreground"
                    >
                      Start
                    </Label>
                    <Input
                      id="event-start"
                      type="datetime-local"
                      value={start}
                      onChange={(e) => {
                        const newStart = e.target.value;
                        setStart(newStart);
                        if (newStart) {
                          const startDate = new Date(newStart);
                          const newEnd = new Date(startDate.getTime() + 30 * 60 * 1000);
                          const pad = (n: number) => n.toString().padStart(2, "0");
                          setEnd(
                            `${newEnd.getFullYear()}-${pad(newEnd.getMonth() + 1)}-${pad(newEnd.getDate())}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`,
                          );
                        }
                      }}
                      required
                      className="tabular-nums"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="event-end"
                      className="font-display text-xs italic tracking-wide text-muted-foreground"
                    >
                      End
                    </Label>
                    <Input
                      id="event-end"
                      type="datetime-local"
                      min={start}
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      required
                      className="tabular-nums"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ─── Right column (notes, privacy, assignees, reminders) ─── */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="event-description"
                  className="font-display text-xs italic tracking-wide text-muted-foreground"
                >
                  Notes
                </Label>
                <textarea
                  id="event-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                  rows={3}
                  className="flex w-full rounded-md border border-rule bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label
                  htmlFor="event-private"
                  className="flex items-center gap-2 font-display text-xs italic tracking-wide text-muted-foreground"
                >
                  Private event
                </Label>
                <Switch id="event-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
              </div>

              {!isPrivate && members.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
                    Assignees
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((member) => (
                      <MemberChip
                        key={member.id}
                        member={member}
                        size="sm"
                        checked={assigneeIds.includes(member.id)}
                        onClick={() =>
                          setAssigneeIds((prev) =>
                            prev.includes(member.id)
                              ? prev.filter((id) => id !== member.id)
                              : [...prev, member.id],
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
                  Email reminders
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {REMINDER_PRESETS.map((preset) => {
                    const active = reminderMinutes.has(preset.minutes);
                    return (
                      <button
                        key={preset.minutes}
                        type="button"
                        onClick={() => toggleReminder(preset.minutes)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "bg-foreground text-background"
                            : "border border-rule text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter
            className={cn(
              "sticky -mx-6 -mb-6 mt-2 border-t border-rule bg-background/95 px-6 py-4 backdrop-blur",
              isEdit && "sm:justify-between",
            )}
            style={{ bottom: "-1.5rem" }}
          >
            {isEdit && (
              <div className="flex items-center gap-2">
                {confirmingDelete ? (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {isSeriesEvent && seriesEditMode === "series"
                        ? "Delete entire series?"
                        : "Delete this event?"}
                    </span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={saving}
                      onClick={() => handleDelete(isSeriesEvent && seriesEditMode === "series")}
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      No
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmingDelete(true)}
                    >
                      Delete
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (event) window.location.href = `/api/events/${event.id}/export.ics`;
                      }}
                    >
                      Export
                    </Button>
                  </>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="rounded-full px-5">
                {saving && "Saving..."}
                {!saving && isSeriesEdit && "Preview changes"}
                {!saving && isEdit && !isSeriesEdit && "Save changes"}
                {!saving && isCreate && !isSeries && "Create event"}
                {!saving && isSeries && "Preview series"}
              </Button>
            </div>
          </DialogFooter>
        </form>

        {isEdit && !event?.private && (
          <div className="mt-4 border-t border-rule pt-4">
            <h4 className="mb-2 font-display text-sm italic tracking-wide text-muted-foreground">
              History
            </h4>
            <ChangeLog logs={logs} isLoading={logsLoading} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
