"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarEvent } from "./use-events";

export interface TodayPayload {
  serverNow: string;
  today: CalendarEvent[];
  tomorrow: {
    count: number;
    firstTitle: string | null;
    hasMultiDayStart: boolean;
  };
}

const REFRESH_MS = 60_000;

export function useToday(userIds: string[] | null, enabled = true) {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  const userIdsKey = userIds ? [...userIds].sort().join(",") : "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchKey is the manual refetch trigger
  useEffect(() => {
    if (!enabled) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const params = new URLSearchParams({ tz });
        if (userIdsKey) params.set("userIds", userIdsKey);
        const res = await fetch(`/api/events/today?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to fetch today (${res.status})`);
        const payload = (await res.json()) as TodayPayload;
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch today");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    setIsLoading(true);
    void load();

    // Periodic refresh so the "serverNow" snapshot stays current.
    const interval = setInterval(() => {
      void load();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, userIdsKey, fetchKey]);

  return { data, isLoading, error, refetch };
}
