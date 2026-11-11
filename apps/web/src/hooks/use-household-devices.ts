"use client";

import type {
  DeviceKind,
  DeviceStatus,
  DisplaySettings,
  SpeakerSettings,
  SpeakerSound,
} from "@homecal/shared";
import { useCallback, useEffect, useState } from "react";

export interface SpeakerReport {
  battery?: number | null;
  charging?: boolean | null;
  temperatureC?: number | null;
  wifiRssi?: number | null;
  volumes?: { alarm?: number | null; music?: number | null };
  uptimeS?: number | null;
  agentVersion?: string;
  errors?: string[];
  reportedAt?: string;
}

export interface HouseholdDevice {
  id: string;
  kind: DeviceKind;
  name: string;
  room: string | null;
  memberIds: string[];
  settings: DisplaySettings | SpeakerSettings;
  offlineAfterMinutes: number;
  alertsEnabled: boolean;
  lastSeenAt: string | null;
  status: DeviceStatus;
  lastStatus: SpeakerReport | null;
  key: { id: string; start: string | null; prefix: string | null; ownedByDevices: boolean } | null;
}

export interface Routine {
  id: string;
  memberId: string;
  memberName: string;
  title: string;
  message: string;
  time: string;
  weekDays: number[];
  sound: SpeakerSound;
  enabled: boolean;
  skipHolidays: boolean;
  includeBriefing: boolean;
  pausedUntil: string | null;
  skips: string[];
  next: { date: string; at: string } | null;
  last: { date: string; rangAt: string | null; ok: boolean | null; error: string | null } | null;
  speakers: { id: string; name: string }[];
}

/** Devices + alert recipients + routines for the admin Devices tab. */
export function useHouseholdDevices(enabled: boolean) {
  const [devices, setDevices] = useState<HouseholdDevice[]>([]);
  const [alertRecipientIds, setAlertRecipientIds] = useState<string[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      const [d, r] = await Promise.all([
        fetch("/api/v1/admin/devices", { credentials: "include" }),
        fetch("/api/v1/admin/routines", { credentials: "include" }),
      ]);
      if (!d.ok || !r.ok) throw new Error(`Failed: ${d.status}/${r.status}`);
      const body = (await d.json()) as { devices: HouseholdDevice[]; alertRecipientIds: string[] };
      setDevices(body.devices);
      setAlertRecipientIds(body.alertRecipientIds);
      setRoutines((await r.json()) as Routine[]);
    } catch {
      setError("Failed to load devices");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
    // Status dots and "last seen" go stale fast; refresh while the tab is open.
    const t = setInterval(() => void refetch(), 30_000);
    return () => clearInterval(t);
  }, [enabled, refetch]);

  return { devices, alertRecipientIds, routines, isLoading, error, refetch };
}

/** POST/PATCH/DELETE helper that surfaces the API's `{ error }` message. */
export async function sendJson<T = unknown>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "never";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export const STATUS_LABEL: Record<DeviceStatus, string> = {
  never: "Not set up",
  online: "Online",
  stale: "Late",
  offline: "Offline",
};
