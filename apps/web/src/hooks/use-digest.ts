"use client";

import type { DigestSettings } from "@homecal/shared";
import { useCallback, useEffect, useState } from "react";

export type DigestConfig = DigestSettings;

/** Loads the family daily-digest config from GET /api/admin/digest (admin-only). */
export function useDigest(enabled: boolean) {
  const [config, setConfig] = useState<DigestConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/digest", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setConfig((await res.json()) as DigestConfig);
    } catch {
      setError("Failed to load digest settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refetch();
  }, [enabled, refetch]);

  return { config, isLoading, error, refetch };
}
