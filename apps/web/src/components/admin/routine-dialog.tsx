"use client";

import type { SpeakerSound } from "@homecal/shared";
import { type FormEvent, useEffect, useState } from "react";
import { MemberChip } from "@/components/calendar/member-chip";
import { SUNDAY_ZERO_VALUES, WeekdayPicker } from "@/components/calendar/weekday-picker";
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
import { type Routine, sendJson } from "@/hooks/use-household-devices";
import type { Member } from "@/hooks/use-members";

interface RoutineDialogProps {
  routine: Routine | "new" | null;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}

const fieldLabel = "font-display text-xs italic tracking-wide text-muted-foreground";

/** Create or edit a routine (Phase 25): who, when, what, and the skips. */
export function RoutineDialog({ routine, members, onClose, onSaved }: RoutineDialogProps) {
  const open = routine !== null;
  const existing = routine && routine !== "new" ? routine : null;

  const [memberId, setMemberId] = useState("");
  const [title, setTitle] = useState("Wake up");
  const [time, setTime] = useState("06:45");
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [message, setMessage] = useState("");
  const [sound, setSound] = useState<SpeakerSound>("beeps");
  const [enabled, setEnabled] = useState(true);
  const [skipHolidays, setSkipHolidays] = useState(true);
  const [includeBriefing, setIncludeBriefing] = useState(true);
  const [pausedUntil, setPausedUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    if (existing) {
      setMemberId(existing.memberId);
      setTitle(existing.title);
      setTime(existing.time);
      setDays(new Set(existing.weekDays));
      setMessage(existing.message);
      setSound(existing.sound);
      setEnabled(existing.enabled);
      setSkipHolidays(existing.skipHolidays);
      setIncludeBriefing(existing.includeBriefing);
      setPausedUntil(existing.pausedUntil ?? "");
    } else {
      setMemberId(members[0]?.id ?? "");
      setTitle("Wake up");
      setTime("06:45");
      setDays(new Set([1, 2, 3, 4, 5]));
      setMessage("");
      setSound("beeps");
      setEnabled(true);
      setSkipHolidays(true);
      setIncludeBriefing(true);
      setPausedUntil("");
    }
  }, [open, existing, members]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (days.size === 0) {
      setError("Pick at least one day.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      memberId,
      title: title.trim(),
      time,
      weekDays: [...days],
      message: message.trim(),
      sound,
      enabled,
      skipHolidays,
      includeBriefing,
      pausedUntil: pausedUntil || null,
    };
    try {
      if (existing) await sendJson(`/api/v1/admin/routines/${existing.id}`, "PATCH", body);
      else await sendJson("/api/v1/admin/routines", "POST", body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    setSaving(true);
    try {
      await sendJson(`/api/v1/admin/routines/${existing.id}`, "DELETE");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit routine" : "New routine"}</DialogTitle>
          <DialogDescription>
            Rings on the speakers that play for this person. Not shown on the calendar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className={fieldLabel}>For</Label>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <MemberChip
                  key={m.id}
                  member={m}
                  size="sm"
                  checked={memberId === m.id}
                  onClick={() => setMemberId(m.id)}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="rt-title" className={fieldLabel}>
                Name
              </Label>
              <Input
                id="rt-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={80}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-time" className={fieldLabel}>
                Time
              </Label>
              <Input
                id="rt-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-32 tabular-nums"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className={fieldLabel}>On days</Label>
            <WeekdayPicker
              selected={days}
              values={SUNDAY_ZERO_VALUES}
              onToggle={(v) =>
                setDays((prev) => {
                  const next = new Set(prev);
                  if (next.has(v)) next.delete(v);
                  else next.add(v);
                  return next;
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-message" className={fieldLabel}>
              What it says (blank = “Name, wake up.”)
            </Label>
            <textarea
              id="rt-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Good morning! Time to get up."
              className="rounded-md border border-rule bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="rt-sound" className={fieldLabel}>
              Sound
            </Label>
            <select
              id="rt-sound"
              value={sound}
              onChange={(e) => setSound(e.target.value as SpeakerSound)}
              className="h-9 rounded-md border border-rule bg-transparent px-3 text-sm"
            >
              <option value="beeps">Beeps</option>
              <option value="chime">Chime</option>
              <option value="none">None (speech only)</option>
            </select>
          </div>
          <ToggleRow
            id="rt-briefing"
            label="Read today's events after it"
            checked={includeBriefing}
            onChange={setIncludeBriefing}
          />
          <ToggleRow
            id="rt-holidays"
            label="Skip public holidays"
            checked={skipHolidays}
            onChange={setSkipHolidays}
          />
          <ToggleRow id="rt-enabled" label="On" checked={enabled} onChange={setEnabled} />
          <div className="flex items-center gap-3">
            <Label htmlFor="rt-paused" className={fieldLabel}>
              Paused through (vacation)
            </Label>
            <Input
              id="rt-paused"
              type="date"
              value={pausedUntil}
              onChange={(e) => setPausedUntil(e.target.value)}
              className="w-44"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            {existing ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-full text-destructive hover:text-destructive"
                disabled={saving}
                onClick={() => (confirmDelete ? void handleDelete() : setConfirmDelete(true))}
              >
                {confirmDelete ? "Confirm delete" : "Delete"}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" className="rounded-full px-6" disabled={saving || !memberId}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-rule p-3">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
