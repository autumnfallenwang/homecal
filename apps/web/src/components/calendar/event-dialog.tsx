"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ChangeLog } from "@/components/calendar/change-log";
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

interface EventDialogProps {
  date: Date | null;
  event: CalendarEvent | null;
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

export function EventDialog({ date, event, onClose, onSaved }: EventDialogProps) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
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

  function resetForm() {
    setTitle("");
    setStart("");
    setEnd("");
    setIsPrivate(false);
    setError(null);
    setSaving(false);
    setConfirmingDelete(false);
  }

  // Set defaults when creating (date changes)
  useEffect(() => {
    if (date && !event) {
      const hours = date.getHours();
      const startHour = hours > 0 ? hours : 9; // month clicks = midnight → default 9am
      setStart(toLocalDatetime(date, startHour));
      setEnd(toLocalDatetime(date, startHour + 1));
    }
  }, [date, event]);

  // Pre-populate form when editing
  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setStart(isoToLocalDatetime(event.start));
      setEnd(isoToLocalDatetime(event.end));
      setIsPrivate(event.private);
    }
  }, [event]);

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
      };

      const url = isEdit ? `/api/events/${event.id}` : "/api/events";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const action = isEdit ? "update" : "create";
        throw new Error(data?.error ?? `Failed to ${action} event (${res.status})`);
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
