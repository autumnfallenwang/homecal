"use client";

import { useEffect, useState } from "react";

export interface HolidayCountry {
  code: string;
  name: string;
}

/**
 * Fetches the supported holiday country list (~200 entries) once per session.
 * Backend sorts alphabetically by name. Cached at the module level so the
 * settings modal doesn't re-hit the endpoint on every open.
 */
let cache: HolidayCountry[] | null = null;
let inflight: Promise<HolidayCountry[]> | null = null;

export function useCountries() {
  const [countries, setCountries] = useState<HolidayCountry[]>(cache ?? []);
  const [isLoading, setIsLoading] = useState(!cache);

  useEffect(() => {
    if (cache) {
      setCountries(cache);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    if (!inflight) {
      inflight = fetch("/api/holidays/countries", { credentials: "include" })
        .then((res) => {
          if (!res.ok) throw new Error(`Failed: ${res.status}`);
          return res.json() as Promise<HolidayCountry[]>;
        })
        .then((data) => {
          cache = data;
          return data;
        });
    }
    inflight
      .then((data) => {
        if (!cancelled) {
          setCountries(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { countries, isLoading };
}
