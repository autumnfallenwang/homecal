"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FamilyCard, type FamilyMember } from "@/components/admin/family-card";
import { InviteCard } from "@/components/admin/invite-card";
import { MemberDrawer } from "@/components/admin/member-drawer";
import { ServiceAccountDrawer } from "@/components/admin/service-account-drawer";
import { ServicesGrid } from "@/components/admin/services-grid";
import { Button } from "@/components/ui/button";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { type ServiceAccount, useServiceAccounts } from "@/hooks/use-service-accounts";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type AdminTab = "family" | "services";

export default function AdminPage() {
  const { session, isPending } = useAuthRedirect(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: AdminTab = searchParams.get("tab") === "services" ? "services" : "family";

  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<FamilyMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<FamilyMember | "new" | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceAccount | "new" | null>(null);

  const isAdmin = session?.user?.role === "admin";
  const {
    services,
    isLoading: servicesLoading,
    error: servicesError,
    refetch: refetchServices,
  } = useServiceAccounts(isAdmin && tab === "services");

  const setTab = useCallback(
    (next: AdminTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "family") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `/admin?${qs}` : "/admin", { scroll: false });
    },
    [router, searchParams],
  );

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
        // `/api/users` already filters out service accounts — using its id set
        // here hides them from the Family tab without a separate query.
        setAllUsers(
          adminRes.data.users
            .filter((u) => colorMap.has(u.id))
            .map((u) => ({
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
  const sortedUsers = useMemo(
    () =>
      [...allUsers].sort((a, b) => {
        const selfId = session?.user?.id;
        if (a.id === selfId) return -1;
        if (b.id === selfId) return 1;
        return a.name.localeCompare(b.name);
      }),
    [allUsers, session?.user?.id],
  );

  let heroSubtitle: string;
  if (tab === "family") {
    if (loading) {
      heroSubtitle = "loading…";
    } else {
      const s = allUsers.length === 1 ? "" : "s";
      heroSubtitle = `${allUsers.length} member${s} · managed by ${session?.user?.name ?? "you"}`;
    }
  } else if (servicesLoading) {
    heroSubtitle = "loading…";
  } else {
    const s = services.length === 1 ? "" : "s";
    heroSubtitle = `${services.length} service${s} · machine callers`;
  }

  const heroTitle = tab === "family" ? "Family" : "Services";

  if (isPending || !session || !isAdmin) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-12">
      {/* ─── Hero ─── */}
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-light leading-[0.9] tracking-tight"
            style={{ fontSize: "clamp(3rem, 7vw, 5.5rem)" }}
          >
            {heroTitle}
          </h1>
          <p className="mt-2 font-display text-base italic text-muted-foreground md:text-lg">
            {heroSubtitle}
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

      {/* ─── Tab switcher ─── */}
      <div
        className="mb-8 inline-flex items-center gap-1 rounded-full border border-rule bg-card p-1"
        role="tablist"
      >
        {(["family", "services"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-4 py-1.5 font-display text-sm capitalize transition-colors",
              tab === key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {key}
          </button>
        ))}
      </div>

      {(error || servicesError) && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error ?? servicesError}
        </div>
      )}

      {tab === "family" && loading && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton slot
              key={i}
              className="aspect-[4/5] rounded-2xl border border-rule bg-muted motion-safe:animate-pulse"
            />
          ))}
        </div>
      )}
      {tab === "family" && !loading && (
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
      {tab === "services" && (
        <ServicesGrid services={services} loading={servicesLoading} onOpen={setSelectedService} />
      )}

      <MemberDrawer
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
        onSaved={() => void fetchUsers()}
      />

      <ServiceAccountDrawer
        service={selectedService}
        onClose={() => setSelectedService(null)}
        onSaved={() => void refetchServices()}
      />
    </div>
  );
}
