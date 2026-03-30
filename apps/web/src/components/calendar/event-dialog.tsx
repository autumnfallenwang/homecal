"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ChangeLog } from "@/components/calendar/change-log";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export interface ParsedEvent {
  title: string;
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

export function EventDialog({
  date,
  event,
  parsedEvent,
  members,
  onClose,
  onSaved,
}: EventDialogProps) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [reminderMinutes, setReminderMinutes] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { logs, isLoading: logsLoading } = useEventLogs(event?.id ?? null);

  const isCreate = date !== null && event === null;
  const isEdit = event !== null;
  const open = isCreate || isEdit;
  const submitLabel = isEdit ? "Save Changes" : "Create Event";

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      onClose();
      resetForm();
    }
  }

  const REMINDER_PRESETS = [
    { minutes: 15, label: "15 min before" },
    { minutes: 60, label: "1 hour before" },
    { minutes: 1440, label: "1 day before" },
  ];

  function resetForm() {
    setTitle("");
    setStart("");
    setEnd("");
    setIsPrivate(false);
    setAssigneeIds([]);
    setReminderMinutes(new Set());
    setError(null);
    setSaving(false);
    setConfirmingDelete(false);
  }

  // Pre-fill from smart input — LLM returns UTC times that represent the user's
  // intended local time, so extract YYYY-MM-DDTHH:MM directly without Date conversion
  useEffect(() => {
    if (parsedEvent && date && !event) {
      setTitle(parsedEvent.title);
      setStart(parsedEvent.start.slice(0, 16));
      setEnd(parsedEvent.end.slice(0, 16));
      if (parsedEvent.assigneeIds?.length) {
        setAssigneeIds(parsedEvent.assigneeIds);
      }
    }
  }, [parsedEvent, date, event]);

  // Set defaults when creating (date changes)
  useEffect(() => {
    if (date && !event && !parsedEvent) {
      const hours = date.getHours();
      const startHour = hours > 0 ? hours : 9; // month clicks = midnight → default 9am
      setStart(toLocalDatetime(date, startHour));
      setEnd(toLocalDatetime(date, startHour + 1));
    }
  }, [date, event, parsedEvent]);

  // Pre-populate form when editing
  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setStart(isoToLocalDatetime(event.start));
      setEnd(isoToLocalDatetime(event.end));
      setIsPrivate(event.private);
      setAssigneeIds(event.assignees.map((a) => a.id));
      setReminderMinutes(
        new Set(event.reminders.filter((r) => r.channel === "email").map((r) => r.minutesBefore)),
      );
    }
  }, [event]);

  async function toggleReminder(minutes: number) {
    const has = reminderMinutes.has(minutes);

    if (isEdit && event) {
      // Immediate API call for existing events
      if (has) {
        const reminder = event.reminders.find(
          (r) => r.minutesBefore === minutes && r.channel === "email",
        );
        if (reminder) {
          await fetch(`/api/events/${event.id}/reminders/${reminder.id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      } else {
        await fetch(`/api/events/${event.id}/reminders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ minutesBefore: minutes, channel: "email" }),
        });
      }
      onSaved(); // refetch events to get updated reminders
    }

    setReminderMinutes((prev) => {
      const next = new Set(prev);
      if (has) {
        next.delete(minutes);
      } else {
        next.add(minutes);
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const body = {
        title,
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

      // Create reminders for newly created events
      if (isCreate && reminderMinutes.size > 0 && responseData?.id) {
        for (const minutes of reminderMinutes) {
          await fetch(`/api/events/${responseData.id}/reminders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ minutesBefore: minutes, channel: "email" }),
          });
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

  async function handleDelete() {
    if (!event) return;
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Failed to delete event (${res.status})`);
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Event" : "New Event"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update or delete this event." : "Create a new calendar event."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-start">Start</Label>
              <Input
                id="event-start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-end">End</Label>
              <Input
                id="event-end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="event-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
            <Label htmlFor="event-private">Private event</Label>
          </div>

          {!isPrivate && members.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Assignees</Label>
              <div className="flex flex-col gap-1.5">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`assignee-${member.id}`}
                      checked={assigneeIds.includes(member.id)}
                      onCheckedChange={(checked) => {
                        setAssigneeIds((prev) =>
                          checked ? [...prev, member.id] : prev.filter((id) => id !== member.id),
                        );
                      }}
                    />
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: member.color }}
                    />
                    <label htmlFor={`assignee-${member.id}`} className="cursor-pointer text-sm">
                      {member.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>Email Reminders</Label>
            <div className="flex flex-wrap gap-2">
              {REMINDER_PRESETS.map((preset) => (
                <Button
                  key={preset.minutes}
                  type="button"
                  variant={reminderMinutes.has(preset.minutes) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleReminder(preset.minutes)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className={isEdit ? "sm:justify-between" : ""}>
            {isEdit && (
              <div className="flex items-center gap-2">
                {confirmingDelete ? (
                  <>
                    <span className="text-sm text-muted-foreground">Delete this event?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={saving}
                      onClick={handleDelete}
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
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>

        {isEdit && !event?.private && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">History</h4>
            <ChangeLog logs={logs} isLoading={logsLoading} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
