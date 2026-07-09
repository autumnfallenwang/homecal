"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MemberChip } from "@/components/calendar/member-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDigest } from "@/hooks/use-digest";
import { useMembers } from "@/hooks/use-members";

// Curated household timezones. A single family zone drives the digest's send
// time (the scheduler has no browser to infer one) — see Phase 21 design notes.
const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
];

export function NotificationsPanel({ enabled }: { enabled: boolean }) {
  const { config, isLoading, error, refetch } = useDigest(enabled);
  const { members } = useMembers();

  const [digestOn, setDigestOn] = useState(false);
  const [sendAt, setSendAt] = useState("07:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [recipients, setRecipients] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Seed the form once the config loads.
  useEffect(() => {
    if (!config) return;
    setDigestOn(config.enabled);
    setSendAt(config.sendAt);
    setTimezone(config.timezone);
    setRecipients(new Set(config.recipientIds));
  }, [config]);

  // Auto-clear the transient success / info notice.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Keep a stored non-standard zone selectable so a save never drops it.
  const tzOptions = useMemo(
    () => (TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]),
    [timezone],
  );

  const toggleRecipient = useCallback((id: string) => {
    setRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/digest", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: digestOn,
          sendAt,
          timezone,
          recipientIds: [...recipients],
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      await refetch();
      setNotice("Saved.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [digestOn, sendAt, timezone, recipients, refetch]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/digest/test", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Test send failed (${res.status})`);
      const body = (await res.json()) as { recipients: number; sent: number };
      setNotice(
        body.sent === 0
          ? "No one to send to — add a recipient first."
          : `Test digest sent to ${body.sent} ${body.sent === 1 ? "person" : "people"}.`,
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setTesting(false);
    }
  }, []);

  if (isLoading && !config) {
    return (
      <div className="max-w-2xl rounded-2xl border border-rule bg-card p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-12 w-full" />
        <Skeleton className="mt-3 h-12 w-full" />
        <Skeleton className="mt-3 h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl rounded-2xl border border-rule bg-card p-6 shadow-(--shadow-card)">
      <div className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
        Admin only
      </div>
      <h2 className="mt-1 font-display text-2xl font-light tracking-tight">Daily digest</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A once-a-day email summarizing everything on the family calendar that day.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-lg border border-rule p-3">
          <Label htmlFor="digest-enabled" className="font-medium">
            Send a daily digest
          </Label>
          <Switch id="digest-enabled" checked={digestOn} onCheckedChange={setDigestOn} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
            Send at · household timezone
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="time"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
              className="w-32 tabular-nums"
              aria-label="Send time"
            />
            <select
              aria-label="Household timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-9 rounded-md border border-rule bg-transparent px-3 text-sm"
            >
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="font-display text-xs italic tracking-wide text-muted-foreground">
            Send to
          </Label>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No family members yet.</p>
          ) : (
            <div className="flex flex-row flex-wrap gap-1.5">
              {members.map((m) => (
                <MemberChip
                  key={m.id}
                  member={m}
                  checked={recipients.has(m.id)}
                  onClick={() => toggleRecipient(m.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" className="rounded-full px-5" disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={testing}
          onClick={handleTest}
        >
          {testing ? "Sending…" : "Send test digest"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => window.open("/api/admin/digest/print", "_blank", "noopener")}
        >
          Print
        </Button>
        {config?.lastSentOn && (
          <span className="font-display text-xs italic text-muted-foreground">
            Last sent {config.lastSentOn}
          </span>
        )}
      </div>

      {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
      {notice && (
        <div className="mt-3 rounded-lg border border-accent/40 bg-accent-soft/30 px-3 py-2 text-sm">
          {notice}
        </div>
      )}
    </div>
  );
}
