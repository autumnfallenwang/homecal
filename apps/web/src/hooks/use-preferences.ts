"use client";

import { useCallback, useEffect, useState } from "react";

interface UserPreferences {
  holidayCountries: string[];
}

/**
 * Loads the current user's preferences (currently just `holidayCountries`)
 * and exposes a setter that PATCHes + updates local state. The server-side
 * handler derives a default from Accept-Language when nothing is stored, so
 * the initial GET is usually enough — users rarely need to open settings.
 */
export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>({ holidayCountries: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetch("/api/users/me/preferences", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPrefs(data as UserPreferences);
      })
      .catch(() => {
        // Preferences are non-critical — fall back to no holidays rather
        // than breaking the calendar.
        if (!cancelled) setError("Failed to load preferences");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setHolidayCountries = useCallback(async (countries: string[]) => {
    const res = await fetch("/api/users/me/preferences", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holidayCountries: countries }),
    });
    if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
    const body = (await res.json()) as UserPreferences;
    setPrefs(body);
    return body;
  }, []);

  return { prefs, isLoading, error, setHolidayCountries };
}
