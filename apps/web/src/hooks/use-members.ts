"use client";

import { useEffect, useState } from "react";

export interface Member {
  id: string;
  name: string;
  color: string;
}

export function useMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/users", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch(() => {
        // Silently fail — members are non-critical for rendering
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { members, isLoading };
}
