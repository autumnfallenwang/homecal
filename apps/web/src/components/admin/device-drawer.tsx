"use client";

import type { DeviceKind, DisplaySettings, SpeakerSettings } from "@homecal/shared";
import { BatteryCharging, Loader2, Monitor, Speaker, Volume2, Wifi } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { MemberChip } from "@/components/calendar/member-chip";
import { SUNDAY_ZERO_VALUES, WeekdayPicker } from "@/components/calendar/weekday-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  type HouseholdDevice,
  relativeTime,
  STATUS_LABEL,
  sendJson,
} from "@/hooks/use-household-devices";
import type { Member } from "@/hooks/use-members";
import { cn } from "@/lib/utils";
import { KeyReveal } from "./key-reveal";

interface DeviceDrawerProps {
  device: HouseholdDevice | "new" | null;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}

interface AdoptableKey {
  id: string;
  name: string | null;
  start: string | null;
  ownerName: string;
  lastRequest: string | null;
}

const QUIET_PRESETS: { label: string; days: number[] }[] = [
  { label: "School nights", days: [0, 1, 2, 3, 4] },
  { label: "Every night", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Weekend nights", days: [5, 6] },
];

const sectionTitle = "font-display text-xs italic uppercase tracking-widest text-muted-foreground";
const fieldLabel = "font-display text-xs italic tracking-wide text-muted-foreground";
const selectClass = "h-9 rounded-md border border-rule bg-transparent px-3 text-sm";

function toggleIn(set: Set<number>, v: number): Set<number> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

export function DeviceDrawer({ device, members, onClose, onSaved }: DeviceDrawerProps) {
  const open = device !== null;
  const isNew = device === "new";
  const existing = device && device !== "new" ? device : null;

  // Shared fields
  const [kind, setKind] = useState<DeviceKind>("speaker");
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [offlineAfter, setOfflineAfter] = useState("5");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  // Display
  const [refreshSeconds, setRefreshSeconds] = useState("");
  const [adoptKeyId, setAdoptKeyId] = useState("");
  const [adoptable, setAdoptable] = useState<AdoptableKey[]>([]);
  // Speaker
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [alarmVolume, setAlarmVolume] = useState(10);
  const [musicVolume, setMusicVolume] = useState(8);
  const [quietOn, setQuietOn] = useState(false);
  const [quietStart, setQuietStart] = useState("21:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const [quietDays, setQuietDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4]));
  const [agentVersion, setAgentVersion] = useState("");
  const [releases, setReleases] = useState<string[]>([]);
  // Actions
  const [sayText, setSayText] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ key: string; kind: DeviceKind } | null>(null);
  const [confirming, setConfirming] = useState<"rotate" | "revoke" | "delete" | null>(null);

  // Seed the form when a device opens (or "new"), not on every 30 s refetch of
  // the same device — that would wipe edits in progress.
  const existingRef = useRef(existing);
  existingRef.current = existing;
  const seedKey = open ? (existing?.id ?? "new") : null;

  useEffect(() => {
    if (!seedKey) return;
    const current = existingRef.current;
    setError(null);
    setNotice(null);
    setRevealed(null);
    setConfirming(null);
    setSayText("");
    setAdoptKeyId("");
    if (!current) {
      setKind("speaker");
      setName("");
      setRoom("");
      setMemberIds(new Set());
      setOfflineAfter("5");
      setAlertsEnabled(true);
      setRefreshSeconds("");
      setLanguage("en");
      setAlarmVolume(10);
      setMusicVolume(8);
      setQuietOn(false);
      setQuietStart("21:00");
      setQuietEnd("07:00");
      setQuietDays(new Set([0, 1, 2, 3, 4]));
      setAgentVersion("");
      return;
    }
    setKind(current.kind);
    setName(current.name);
    setRoom(current.room ?? "");
    setMemberIds(new Set(current.memberIds));
    setOfflineAfter(String(current.offlineAfterMinutes));
    setAlertsEnabled(current.alertsEnabled);
    if (current.kind === "display") {
      const s = current.settings as DisplaySettings;
      setRefreshSeconds(s.refreshSeconds === null ? "" : String(s.refreshSeconds));
    } else {
      const s = current.settings as SpeakerSettings;
      setLanguage(s.language);
      setAlarmVolume(s.volumes.alarm);
      setMusicVolume(s.volumes.music);
      setQuietOn(s.quietHours.enabled);
      setQuietStart(s.quietHours.start);
      setQuietEnd(s.quietHours.end);
      setQuietDays(new Set(s.quietHours.days));
      setAgentVersion(s.agentVersion ?? "");
    }
  }, [seedKey]);

  // Options: adoptable keys (new display) and bundled agent releases (speaker).
  useEffect(() => {
    if (!open) return;
    if (isNew) {
      fetch("/api/v1/admin/devices/adoptable-keys", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: AdoptableKey[]) => setAdoptable(rows))
        .catch(() => setAdoptable([]));
    }
    fetch("/api/v1/admin/devices/agent-releases", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { version: string }[]) => setReleases(rows.map((x) => x.version)))
      .catch(() => setReleases([]));
  }, [open, isNew]);

  // While a speaker is open, ask it to poll every 15 s so Say now lands fast.
  useEffect(() => {
    if (!existing || existing.kind !== "speaker") return;
    const ping = () =>
      void fetch(`/api/v1/admin/devices/${existing.id}/attention`, {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
    ping();
    const t = setInterval(ping, 90_000);
    return () => clearInterval(t);
  }, [existing]);

  const settingsPayload = () =>
    kind === "display"
      ? { refreshSeconds: refreshSeconds.trim() === "" ? null : Number(refreshSeconds) }
      : {
          language,
          volumes: { alarm: alarmVolume, music: musicVolume },
          quietHours: { enabled: quietOn, start: quietStart, end: quietEnd, days: [...quietDays] },
          agentVersion: agentVersion || null,
        };

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const common = {
        name: name.trim(),
        room: room.trim() || null,
        memberIds: [...memberIds],
        offlineAfterMinutes: Number(offlineAfter) || undefined,
        alertsEnabled,
        settings: settingsPayload(),
      };
      if (isNew) {
        const created = await sendJson<{ device: HouseholdDevice; key: string | null }>(
          "/api/v1/admin/devices",
          "POST",
          { kind, ...common, ...(adoptKeyId ? { adoptApiKeyId: adoptKeyId } : {}) },
        );
        onSaved();
        if (created.key) setRevealed({ key: created.key, kind });
        else onClose();
      } else if (existing) {
        await sendJson(`/api/v1/admin/devices/${existing.id}`, "PATCH", common);
        onSaved();
        setNotice("Saved.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function act(label: string, fn: () => Promise<string | undefined>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const message = await fn();
      if (message) setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const announce = (text: string, sound: "chime" | "beeps") =>
    act(text === sayText ? "say" : "test", async () => {
      if (!existing) return;
      await sendJson(`/api/v1/admin/devices/${existing.id}/announce`, "POST", { text, sound });
      if (text === sayText) setSayText("");
      return "Sent — it plays within about 15 seconds.";
    });

  const rotate = () =>
    act("rotate", async () => {
      if (!existing) return;
      const r = await sendJson<{ key: string }>(
        `/api/v1/admin/devices/${existing.id}/rotate-key`,
        "POST",
      );
      setConfirming(null);
      setRevealed({ key: r.key, kind: existing.kind });
      onSaved();
      return undefined;
    });

  const revoke = () =>
    act("revoke", async () => {
      if (!existing) return;
      await sendJson(`/api/v1/admin/devices/${existing.id}/key`, "DELETE");
      setConfirming(null);
      onSaved();
      return "Key revoked. The device can't check in until it gets a new one.";
    });

  const remove = () =>
    act("delete", async () => {
      if (!existing) return;
      await sendJson(`/api/v1/admin/devices/${existing.id}`, "DELETE");
      onSaved();
      onClose();
      return undefined;
    });

  const report = existing?.kind === "speaker" ? existing.lastStatus : null;
  const submitLabel = isNew ? "Add device" : "Save";
  const Icon = kind === "speaker" ? Speaker : Monitor;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col overflow-y-auto p-0">
        <SheetHeader className="flex-row items-center gap-4 border-b border-rule p-6 pb-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-rule">
            <Icon className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <SheetTitle className="truncate">{existing?.name ?? "New device"}</SheetTitle>
            <SheetDescription>
              {existing
                ? `${STATUS_LABEL[existing.status]} · last seen ${relativeTime(existing.lastSeenAt)}`
                : "A Kindle display or a speaker phone"}
            </SheetDescription>
          </div>
        </SheetHeader>

        {/* Just registered: show only the key, once, and a way out. */}
        {isNew && revealed && (
          <div className="flex flex-col gap-4 p-6">
            <KeyReveal
              label="Device key"
              plaintext={revealed.key}
              hint={setupHint(revealed.kind)}
              onDismiss={onClose}
            />
            <Button type="button" className="self-start rounded-full px-6" onClick={onClose}>
              Done
            </Button>
          </div>
        )}

        <form
          onSubmit={handleSave}
          className={cn("flex flex-col gap-7 p-6", isNew && revealed && "hidden")}
        >
          {!isNew && revealed && (
            <KeyReveal
              label="Device key"
              plaintext={revealed.key}
              hint={setupHint(revealed.kind)}
              onDismiss={() => setRevealed(null)}
            />
          )}

          {/* ─── Live status (speaker) ─── */}
          {report && (
            <section className="flex flex-col gap-3">
              <h3 className={sectionTitle}>Status</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <StatusTile icon={BatteryCharging} label="Battery">
                  {report.battery ?? "?"}%{report.charging ? " · charging" : ""}
                </StatusTile>
                <StatusTile icon={Wifi} label="Wi-Fi">
                  {report.wifiRssi != null ? `${report.wifiRssi} dBm` : "unknown"}
                </StatusTile>
                <StatusTile icon={Volume2} label="Volumes now">
                  alarm {report.volumes?.alarm ?? "?"} · media {report.volumes?.music ?? "?"}
                </StatusTile>
                <StatusTile icon={Speaker} label="Agent">
                  v{report.agentVersion ?? "?"}
                </StatusTile>
              </div>
              {report.errors && report.errors.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {report.errors.map((e) => (
                    <div key={e}>{e}</div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ─── Say now (speaker) ─── */}
          {existing?.kind === "speaker" && (
            <section className="flex flex-col gap-3">
              <h3 className={sectionTitle}>Say now</h3>
              <div className="flex gap-2">
                <Input
                  value={sayText}
                  onChange={(e) => setSayText(e.target.value)}
                  placeholder="Dinner is ready"
                  maxLength={300}
                  aria-label="Message to speak"
                />
                <Button
                  type="button"
                  className="rounded-full"
                  disabled={!sayText.trim() || busy === "say"}
                  onClick={() => void announce(sayText.trim(), "chime")}
                >
                  {busy === "say" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Say"}
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="self-start rounded-full"
                disabled={busy === "test"}
                onClick={() => void announce("This is a test from HomeCal.", "beeps")}
              >
                Test sound
              </Button>
            </section>
          )}

          {/* ─── Details ─── */}
          <section className="flex flex-col gap-3">
            <h3 className={sectionTitle}>Details</h3>
            {isNew && (
              <div className="inline-flex self-start rounded-full border border-rule p-1">
                {(["speaker", "display"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      setOfflineAfter(k === "speaker" ? "5" : "30");
                    }}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm capitalize",
                      kind === k ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dev-name" className={fieldLabel}>
                Name
              </Label>
              <Input
                id="dev-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === "speaker" ? "Kids' room speaker" : "Kitchen Kindle"}
                required
                maxLength={64}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dev-room" className={fieldLabel}>
                Room
              </Label>
              <Input
                id="dev-room"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="Kids' room"
                maxLength={64}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className={fieldLabel}>
                {kind === "speaker" ? "Plays for" : "Shows events for (none = everyone)"}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <MemberChip
                    key={m.id}
                    member={m}
                    checked={memberIds.has(m.id)}
                    size="sm"
                    onClick={() =>
                      setMemberIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.id)) next.delete(m.id);
                        else next.add(m.id);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            </div>
            {isNew && kind === "display" && adoptable.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dev-adopt" className={fieldLabel}>
                  Already has a key (e.g. the Kindle)
                </Label>
                <select
                  id="dev-adopt"
                  value={adoptKeyId}
                  onChange={(e) => setAdoptKeyId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Mint a new key</option>
                  {adoptable.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.ownerName} · {k.name ?? "key"} ({k.start ?? "hc_"}…) · used{" "}
                      {relativeTime(k.lastRequest)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dev-offline" className={fieldLabel}>
                  Offline after (min)
                </Label>
                <Input
                  id="dev-offline"
                  type="number"
                  min={2}
                  max={1440}
                  value={offlineAfter}
                  onChange={(e) => setOfflineAfter(e.target.value)}
                  className="w-28 tabular-nums"
                />
              </div>
              <div className="flex flex-1 items-center justify-between rounded-lg border border-rule p-3">
                <Label htmlFor="dev-alerts" className="text-sm">
                  Email when offline
                </Label>
                <Switch
                  id="dev-alerts"
                  checked={alertsEnabled}
                  onCheckedChange={setAlertsEnabled}
                />
              </div>
            </div>
          </section>

          {/* ─── Display settings ─── */}
          {kind === "display" && (
            <section className="flex flex-col gap-3">
              <h3 className={sectionTitle}>Display</h3>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dev-refresh" className={fieldLabel}>
                  Refresh every (seconds, blank = 600)
                </Label>
                <Input
                  id="dev-refresh"
                  type="number"
                  min={0}
                  max={3600}
                  value={refreshSeconds}
                  onChange={(e) => setRefreshSeconds(e.target.value)}
                  className="w-32 tabular-nums"
                />
              </div>
            </section>
          )}

          {/* ─── Speaker settings ─── */}
          {kind === "speaker" && (
            <section className="flex flex-col gap-3">
              <h3 className={sectionTitle}>Sound</h3>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dev-lang" className={fieldLabel}>
                  Spoken language
                </Label>
                <select
                  id="dev-lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "zh")}
                  className={cn(selectClass, "w-40")}
                >
                  <option value="en">English</option>
                  <option value="zh">Chinese</option>
                </select>
              </div>
              <VolumeRow
                label="Alarm & speech volume"
                value={alarmVolume}
                onChange={setAlarmVolume}
              />
              <VolumeRow label="Sound volume" value={musicVolume} onChange={setMusicVolume} />

              <div className="mt-2 flex items-center justify-between rounded-lg border border-rule p-3">
                <Label htmlFor="dev-quiet" className="text-sm">
                  Quiet hours
                  <span className="block text-xs text-muted-foreground">
                    Wake-ups still ring; Say now and automatic reminders wait.
                  </span>
                </Label>
                <Switch id="dev-quiet" checked={quietOn} onCheckedChange={setQuietOn} />
              </div>
              {quietOn && (
                <div className="flex flex-col gap-3 rounded-lg border border-rule p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={quietStart}
                      onChange={(e) => setQuietStart(e.target.value)}
                      className="w-32 tabular-nums"
                      aria-label="Quiet from"
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={quietEnd}
                      onChange={(e) => setQuietEnd(e.target.value)}
                      className="w-32 tabular-nums"
                      aria-label="Quiet until"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUIET_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setQuietDays(new Set(p.days))}
                        className="rounded-full border border-rule px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={fieldLabel}>Nights starting on</span>
                    <WeekdayPicker
                      size="sm"
                      selected={quietDays}
                      values={SUNDAY_ZERO_VALUES}
                      onToggle={(v) => setQuietDays((prev) => toggleIn(prev, v))}
                    />
                  </div>
                </div>
              )}

              {!isNew && releases.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dev-agent" className={fieldLabel}>
                    Agent version
                  </Label>
                  <select
                    id="dev-agent"
                    value={agentVersion}
                    onChange={(e) => setAgentVersion(e.target.value)}
                    className={cn(selectClass, "w-56")}
                  >
                    <option value="">Latest ({releases[releases.length - 1]})</option>
                    {[...releases].reverse().map((v) => (
                      <option key={v} value={v}>
                        Pin {v}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && (
            <div className="rounded-lg border border-accent/40 bg-accent-soft/30 px-3 py-2 text-sm">
              {notice}
            </div>
          )}

          <Button type="submit" className="self-start rounded-full px-6" disabled={saving}>
            {saving ? "Saving…" : submitLabel}
          </Button>

          {/* ─── Key + danger zone ─── */}
          {existing && (
            <section className="flex flex-col gap-3 border-t border-rule pt-6">
              <h3 className={sectionTitle}>Key</h3>
              <p className="text-sm text-muted-foreground">
                {existing.key ? (
                  <code className="font-mono text-xs">{existing.key.start ?? "hc_"}…</code>
                ) : (
                  "No key — the device can't check in."
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {confirming === "rotate" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={busy === "rotate"}
                    onClick={() => void rotate()}
                  >
                    Yes — the old key stops now
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setConfirming("rotate")}
                  >
                    {existing.key ? "Rotate key" : "Issue key"}
                  </Button>
                )}
                {existing.key &&
                  (confirming === "revoke" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full text-destructive"
                      disabled={busy === "revoke"}
                      onClick={() => void revoke()}
                    >
                      Confirm revoke
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => setConfirming("revoke")}
                    >
                      Revoke
                    </Button>
                  ))}
              </div>
              <h3 className={cn(sectionTitle, "mt-4 text-destructive")}>Danger zone</h3>
              {confirming === "delete" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="self-start rounded-full text-destructive"
                  disabled={busy === "delete"}
                  onClick={() => void remove()}
                >
                  Delete {existing.name} and revoke its key
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="self-start rounded-full text-destructive hover:text-destructive"
                  onClick={() => setConfirming("delete")}
                >
                  Delete device
                </Button>
              )}
            </section>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function setupHint(kind: DeviceKind): string {
  return kind === "speaker"
    ? "Save it to a file and run apps/speaker-agent/tools/install.sh <phone-ip> <server-url> <key-file> from the k3s box."
    : "Open /api/v1/dash?key=<this key> on the display.";
}

function StatusTile({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Wifi;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-rule p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden /> {label}
      </div>
      <div className="mt-1 tabular-nums">{children}</div>
    </div>
  );
}

function VolumeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-44 shrink-0 text-muted-foreground">{label}</span>
      <input
        type="range"
        min={0}
        max={15}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-(--accent)"
      />
      <span className="w-6 text-right tabular-nums">{value}</span>
    </label>
  );
}
