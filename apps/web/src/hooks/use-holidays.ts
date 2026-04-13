"use client";

import type { Holiday } from "@homecal/shared";
import { useEffect, useState } from "react";

/**
 * Fetches the read-only national-holiday layer. Mirrors `useEvents` in shape
 * (from/to pair, cancellation via `cancelled` flag). Skips the fetch when
 * `countries` is empty or the range is missing so we don't spam the endpoint
 * on views that don't want holidays at all.
 */
export function useHolidays(countries: string[], from: string, to: string) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable key so we re-fetch when the country list changes (not just the
  // array identity). Sorted so `["US","TW"]` and `["TW","US"]` match.
  const key = [...countries].sort().join(",");

  useEffect(() => {
    if (!from || !to || countries.length === 0) {
      setHolidays([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // The API wants plain YYYY-MM-DD, but calendar code hands us ISO
    // datetimes for events. Slice defensively so both shapes work.
    const fromDate = from.slice(0, 10);
    const toDate = to.slice(0, 10);

    fetch(`/api/holidays?countries=${encodeURIComponent(key)}&from=${fromDate}&to=${toDate}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch holidays: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setHolidays(data as Holiday[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, from, to, countries.length]);

  return { holidays, isLoading, error };
}
