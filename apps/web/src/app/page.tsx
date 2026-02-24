"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { authClient } from "@/lib/auth-client";

export default function HomePage() {
  const { session, isPending } = useAuthRedirect(true);
  const router = useRouter();

  function handleSignOut() {
    void authClient.signOut().then(() => {
      router.push("/login");
    });
  }

  if (isPending || !session) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">Welcome, {session.user.name}!</h1>
      <p className="text-muted-foreground">Your family calendar will appear here.</p>
      <Button variant="outline" onClick={handleSignOut}>
        Sign out
      </Button>
    </main>
  );
}
