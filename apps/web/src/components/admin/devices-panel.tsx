"use client";

import type { DeviceStatus } from "@homecal/shared";
import { AlarmClock, Monitor, Plus, Speaker } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MemberChip } from "@/components/calendar/member-chip";
import { describeWeekdays } from "@/components/calendar/weekday-picker";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  type HouseholdDevice,
  type Routine,
  relativeTime,
  STATUS_LABEL,
  sendJson,
  useHouseholdDevices,
} from "@/hooks/use-household-devices";
import { useMembers } from "@/hooks/use-members";
import { cn } from "@/lib/utils";
import { DeviceDrawer } from "./device-drawer";
import { RoutineDialog } from "./routine-dialog";

const STATUS_DOT: Record<DeviceStatus, string> = {
  never: "bg-muted-foreground/40",
  online: "bg-emerald-500",
  stale: "bg-amber-500",
  offline: "bg-destructive",
};

const sectionTitle = "font-display text-2xl font-light tracking-tight";

function formatAt(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `today ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

/** The admin Devices tab (Phases 23–25): devices, who gets alerts, wake-ups. */
export function DevicesPanel({ enabled }: { enabled: boolean }) {
  const { devices, alertRecipientIds, routines, isLoading, error, refetch } =
    useHouseholdDevices(enabled);
  const { members } = useMembers();
  const [selected, setSelected] = useState<HouseholdDevice | "new" | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<Routine | "new" | null>(null);

  // Keep the open drawer showing fresh status as the list refetches.
  const openDevice =
    selected && selected !== "new"
      ? (devices.find((d) => d.id === selected.id) ?? selected)
      : selected;

  return (
    <div className="flex flex-col gap-12">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h2 className={sectionTitle}>Devices</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {isLoading &&
            Array.from({ length: 2 }).map((_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton slot
                key={i}
                className="aspect-square rounded-2xl border border-rule bg-muted motion-safe:animate-pulse"
              />
            ))}
          {!isLoading &&
            devices.map((d) => (
              <DeviceCard key={d.id} device={d} members={members} onClick={() => setSelected(d)} />
            ))}
          <button
            type="button"
            onClick={() => setSelected("new")}
            className="group/add flex aspect-square flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-rule p-5 text-center transition-all hover:-translate-y-0.5 hover:border-accent"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-rule text-muted-foreground group-hover/add:border-accent group-hover/add:text-accent">
              <Plus className="h-6 w-6" />
            </div>
            <div className="font-display text-lg italic text-muted-foreground">Add device</div>
          </button>
        </div>
      </section>

      <AlertRecipients
        enabled={enabled}
        members={members}
        initial={alertRecipientIds}
        onSaved={() => void refetch()}
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className={sectionTitle}>Wake-ups &amp; routines</h2>
            <p className="mt-1 font-display text-sm italic text-muted-foreground">
              Daily sounds held by the speakers. They ring even if HomeCal is down, and never show
              on the calendar.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => setEditingRoutine("new")}
          >
            <AlarmClock className="h-4 w-4" /> Add routine
          </Button>
        </div>
        {routines.length === 0 && !isLoading && (
          <p className="rounded-2xl border border-dashed border-rule p-8 text-center font-display italic text-muted-foreground">
            No routines yet.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {routines.map((r) => (
            <RoutineRow
              key={r.id}
              routine={r}
              member={members.find((m) => m.id === r.memberId)}
              onEdit={() => setEditingRoutine(r)}
              onChanged={() => void refetch()}
            />
          ))}
        </div>
      </section>

      <DeviceDrawer
        device={openDevice}
        members={members}
        onClose={() => setSelected(null)}
        onSaved={() => void refetch()}
      />
      <RoutineDialog
        routine={editingRoutine}
        members={members}
        onClose={() => setEditingRoutine(null)}
        onSaved={() => void refetch()}
      />
    </div>
  );
}

function DeviceCard({
  device,
  members,
  onClick,
}: {
  device: HouseholdDevice;
  members: { id: string; name: string; color: string }[];
  onClick: () => void;
}) {
  const Icon = device.kind === "speaker" ? Speaker : Monitor;
  const served = members.filter((m) => device.memberIds.includes(m.id));
  const battery = device.kind === "speaker" ? device.lastStatus?.battery : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/card flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border border-rule bg-card p-5 text-left shadow-(--shadow-card) transition-all hover:-translate-y-0.5 hover:border-accent"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-rule">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex -space-x-1.5">
          {served.slice(0, 4).map((m) => (
            <span
              key={m.id}
              title={m.name}
              className="grid h-6 w-6 place-items-center rounded-full font-display text-[10px] text-white ring-2 ring-card"
              style={{ backgroundColor: m.color }}
            >
              {m.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate font-display text-2xl font-light leading-tight tracking-tight">
          {device.name}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span
            className={cn("inline-block h-1.5 w-1.5 rounded-full", STATUS_DOT[device.status])}
          />
          <span>{STATUS_LABEL[device.status]}</span>
          {device.room && (
            <>
              <span className="opacity-50">·</span>
              <span className="truncate normal-case">{device.room}</span>
            </>
          )}
        </div>
      </div>
      <div className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
        {device.kind === "speaker" && battery != null ? `${battery}% · ` : ""}
        seen {relativeTime(device.lastSeenAt)}
      </div>
    </button>
  );
}

function AlertRecipients({
  enabled,
  members,
  initial,
  onSaved,
}: {
  enabled: boolean;
  members: { id: string; name: string; color: string }[];
  initial: string[];
  onSaved: () => void;
}) {
  const [ids, setIds] = useState<Set<string>>(new Set(initial));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const initialKey = [...initial].sort().join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only when the server list changes
  useEffect(() => {
    setIds(new Set(initial));
  }, [initialKey]);

  const save = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      await sendJson("/api/v1/admin/devices/alerts", "PATCH", { recipientIds: [...ids] });
      setNotice("Saved.");
      onSaved();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [ids, onSaved]);

  if (!enabled) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className={sectionTitle}>Alerts</h2>
      <p className="font-display text-sm italic text-muted-foreground">
        Email these people when a device goes offline or a wake-up doesn&rsquo;t ring.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {members.map((m) => (
          <MemberChip
            key={m.id}
            member={m}
            checked={ids.has(m.id)}
            onClick={() =>
              setIds((prev) => {
                const next = new Set(prev);
                if (next.has(m.id)) next.delete(m.id);
                else next.add(m.id);
                return next;
              })
            }
          />
        ))}
        <Button
          type="button"
          size="sm"
          className="ml-2 rounded-full"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        {notice && (
          <span className="font-display text-xs italic text-muted-foreground">{notice}</span>
        )}
      </div>
    </section>
  );
}

function RoutineRow({
  routine,
  member,
  onEdit,
  onChanged,
}: {
  routine: Routine;
  member?: { id: string; name: string; color: string };
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  let lastLine = "Hasn't rung yet";
  if (routine.last) {
    lastLine = routine.last.ok
      ? `Rang ${routine.last.rangAt ? formatAt(routine.last.rangAt) : routine.last.date}`
      : `Didn't ring ${routine.last.date}${routine.last.error ? ` (${routine.last.error})` : ""}`;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-2xl border border-rule bg-card px-5 py-4",
        !routine.enabled && "opacity-50",
      )}
    >
      <div className="w-20 font-display text-2xl font-light tabular-nums">{routine.time}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {member && (
            <span
              className="grid h-6 w-6 place-items-center rounded-full font-display text-[10px] text-white"
              style={{ backgroundColor: member.color }}
            >
              {member.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="font-medium">
            {routine.memberName} · {routine.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {describeWeekdays(routine.weekDays)}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {routine.next ? `Next ${formatAt(routine.next.at)}` : "No upcoming ring"}
          {" · "}
          <span className={cn(routine.last && routine.last.ok === false && "text-destructive")}>
            {lastLine}
          </span>
          {routine.speakers.length === 0 && (
            <span className="text-destructive"> · no speaker plays for {routine.memberName}</span>
          )}
          {routine.skips.length > 0 && <span> · skipping {routine.skips.join(", ")}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {routine.skips.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full"
            disabled={busy}
            onClick={() =>
              void run(() =>
                sendJson(`/api/v1/admin/routines/${routine.id}/skip/${routine.skips[0]}`, "DELETE"),
              )
            }
          >
            Undo skip
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full"
            disabled={busy || !routine.next}
            onClick={() =>
              void run(() => sendJson(`/api/v1/admin/routines/${routine.id}/skip`, "POST", {}))
            }
          >
            Skip next
          </Button>
        )}
        <Switch
          checked={routine.enabled}
          aria-label="On"
          disabled={busy}
          onCheckedChange={(v) =>
            void run(() =>
              sendJson(`/api/v1/admin/routines/${routine.id}`, "PATCH", { enabled: v }),
            )
          }
        />
        <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </div>
  );
}
