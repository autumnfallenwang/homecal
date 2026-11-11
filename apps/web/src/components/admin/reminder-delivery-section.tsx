"use client";

import type { ReminderDeliveryChannel } from "@homecal/shared";
import { useEffect, useState } from "react";
import { sendJson } from "@/hooks/use-household-devices";
import { cn } from "@/lib/utils";

const CHANNELS: { key: ReminderDeliveryChannel; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "push", label: "iPhone" },
  { key: "speaker", label: "Their speaker" },
];

/**
 * How a member gets their event reminders (Phase 26). A kid without a phone
 * can be set to "Their speaker": every reminder of their events then plays on
 * the speakers that serve them, and no email goes out. Saves on each toggle.
 */
export function ReminderDeliverySection({ userId }: { userId: string }) {
  const [channels, setChannels] = useState<Set<ReminderDeliveryChannel> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/reminder-delivery", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { userId: string; reminderDelivery: ReminderDeliveryChannel[] }[]) => {
        if (cancelled) return;
        const row = rows.find((r) => r.userId === userId);
        setChannels(new Set(row?.reminderDelivery ?? ["email", "push"]));
      })
      .catch(() => !cancelled && setError("Couldn't load reminder settings"));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function toggle(key: ReminderDeliveryChannel) {
    if (!channels) return;
    const next = new Set(channels);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const previous = channels;
    setChannels(next);
    setError(null);
    try {
      await sendJson(`/api/v1/admin/users/${userId}/reminder-delivery`, "PATCH", {
        reminderDelivery: [...next],
      });
    } catch (err) {
      setChannels(previous);
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
        Reminders reach them by
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {CHANNELS.map((c) => {
          const on = channels?.has(c.key) ?? false;
          return (
            <button
              key={c.key}
              type="button"
              disabled={!channels}
              aria-pressed={on}
              onClick={() => void toggle(c.key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                on
                  ? "bg-foreground text-background"
                  : "border border-rule text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {channels && channels.size === 0 && (
        <p className="text-xs text-muted-foreground">No reminders at all for this person.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
