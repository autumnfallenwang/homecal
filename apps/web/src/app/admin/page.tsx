"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FamilyCard, type FamilyMember } from "@/components/admin/family-card";
import { InviteCard } from "@/components/admin/invite-card";
import { MemberDrawer } from "@/components/admin/member-drawer";
import { Button } from "@/components/ui/button";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { authClient } from "@/lib/auth-client";

export default function AdminPage() {
  const { session, isPending } = useAuthRedirect(true);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<FamilyMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<FamilyMember | "new" | null>(null);

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (!isPending && session && !isAdmin) {
      router.replace("/");
    }
  }, [isPending, session, isAdmin, router]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [adminRes, membersRes] = await Promise.all([
        authClient.admin.listUsers({ query: { limit: 100 } }),
        fetch("/api/users", { credentials: "include" }).then((r) => r.json()),
      ]);
      if (adminRes.data) {
        const colorMap = new Map<string, string>();
        for (const m of membersRes as { id: string; color: string }[]) {
          colorMap.set(m.id, m.color);
        }
        setAllUsers(
          adminRes.data.users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role ?? "user",
            banned: u.banned ?? false,
            color: colorMap.get(u.id) ?? "#6b7280",
            createdAt: u.createdAt.toString(),
          })),
        );
      }
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void fetchUsers();
  }, [isAdmin, fetchUsers]);

  // Sort: current user first, then alphabetically.
  const sortedUsers = [...allUsers].sort((a, b) => {
    const selfId = session?.user?.id;
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    return a.name.localeCompare(b.name);
  });

  if (isPending || !session || !isAdmin) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-12">
      {/* ─── Hero ─── */}
      <header className="mb-10 flex items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-light leading-[0.9] tracking-tight"
            style={{ fontSize: "clamp(3rem, 7vw, 5.5rem)" }}
          >
            Family
            <span className="font-display italic text-accent">,</span>
          </h1>
          <p className="mt-2 font-display text-base italic text-muted-foreground md:text-lg">
            {loading
              ? "loading…"
              : `${allUsers.length} member${allUsers.length === 1 ? "" : "s"} · managed by ${session.user.name}`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => router.push("/")}
        >
          ← Back to calendar
        </Button>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ─── Portrait grid ─── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton slot
              key={i}
              className="aspect-[4/5] rounded-2xl border border-rule bg-muted motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {sortedUsers.map((user) => (
            <FamilyCard
              key={user.id}
              member={user}
              isSelf={user.id === session.user.id}
              onClick={() => setSelectedMember(user)}
            />
          ))}
          <InviteCard onClick={() => setSelectedMember("new")} />
        </div>
      )}

      <MemberDrawer
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
        onSaved={() => void fetchUsers()}
      />
    </div>
  );
}
