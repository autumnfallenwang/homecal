"use client";

import { useEffect, useState } from "react";

export interface Member {
  id: string;
  name: string;
  color: string;
}

/** Retry delays for a failed load. One dropped request (an API restart resets
 *  the proxy's kept-alive connection) used to leave every member chip empty
 *  until a full reload. */
const RETRY_DELAYS_MS = [1000, 3000];

export function useMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = (attempt: number) => {
      fetch("/api/users", { credentials: "include" })
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (cancelled) return;
          setMembers(data);
          setIsLoading(false);
        })
        .catch(() => {
          // Members are non-critical for rendering; retry a couple of times.
          if (cancelled) return;
          const delay = RETRY_DELAYS_MS[attempt];
          if (delay === undefined) setIsLoading(false);
          else timer = setTimeout(() => load(attempt + 1), delay);
        });
    };
    load(0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { members, isLoading };
}
