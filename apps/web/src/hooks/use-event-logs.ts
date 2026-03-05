"use client";

import { useEffect, useState } from "react";

export interface EventLogEntry {
  id: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  timestamp: string;
  user: {
    id: string;
    name: string;
    color: string;
  };
}

export function useEventLogs(eventId: string | null) {
  const [logs, setLogs] = useState<EventLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setLogs([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/events/${eventId}/logs`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setLogs(data);
      })
      .catch(() => {
        if (!cancelled) setLogs([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return { logs, isLoading };
}
