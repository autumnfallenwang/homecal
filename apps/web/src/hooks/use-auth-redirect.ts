"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

export function useAuthRedirect(requireAuth: boolean) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;

    if (requireAuth && !session) {
      router.replace("/login");
    } else if (!requireAuth && session) {
      router.replace("/");
    }
  }, [requireAuth, session, isPending, router]);

  return { session, isPending };
}
