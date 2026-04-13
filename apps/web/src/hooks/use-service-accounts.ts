"use client";

import { useCallback, useEffect, useState } from "react";

export interface ServiceAccountUser {
  id: string;
  name: string;
  role: string;
  banned: boolean | null;
  color: string;
  createdAt: string;
}

export interface ServiceApiKey {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  userId: string;
  enabled: boolean;
  requestCount: number;
  lastRequest: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface ServiceAccount {
  user: ServiceAccountUser;
  keys: ServiceApiKey[];
}

export function useServiceAccounts(enabled: boolean) {
  const [services, setServices] = useState<ServiceAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/service-accounts", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setServices((await res.json()) as ServiceAccount[]);
    } catch {
      setError("Failed to load service accounts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refetch();
  }, [enabled, refetch]);

  return { services, isLoading, error, refetch };
}
