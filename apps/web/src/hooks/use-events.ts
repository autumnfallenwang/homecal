"use client";

import { useCallback, useEffect, useState } from "react";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  ownerId: string;
  private: boolean;
  createdAt: string;
  updatedAt: string;
  assignees: { id: string; name: string; color: string }[];
  reminders: { id: string; minutesBefore: number; channel: string }[];
}

export function useEvents(from: string, to: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchKey triggers manual refetch
  useEffect(() => {
    if (!from || !to) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to, fetchKey]);

  return { events, isLoading, error, refetch };
}
