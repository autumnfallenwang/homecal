"use client";

import { Plus, TerminalSquare } from "lucide-react";
import type { ServiceAccount } from "@/hooks/use-service-accounts";
import { cn } from "@/lib/utils";

interface ServicesGridProps {
  services: ServiceAccount[];
  loading: boolean;
  onOpen: (service: ServiceAccount | "new") => void;
}

function relativeFromNow(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

function lastActive(keys: ServiceAccount["keys"]): string {
  const stamps = keys
    .map((k) => k.lastRequest)
    .filter((s): s is string => !!s)
    .map((s) => new Date(s).getTime())
    .filter((n) => !Number.isNaN(n));
  if (stamps.length === 0) return "never";
  return relativeFromNow(new Date(Math.max(...stamps)).toISOString());
}

export function ServicesGrid({ services, loading, onOpen }: ServicesGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton slot
            key={i}
            className="aspect-square rounded-2xl border border-rule bg-muted motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-dashed border-rule bg-paper-warm/30 p-10 text-center md:col-span-2 lg:col-span-3">
          <TerminalSquare className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="font-display text-xl italic text-muted-foreground">
            No service accounts yet.
          </p>
          <p className="mt-1 font-display text-sm italic text-muted-foreground/70">
            Add your first one to let other apps talk to HomeCal.
          </p>
        </div>
        <AddServiceCard onClick={() => onOpen("new")} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {services.map((svc) => (
        <ServiceCard key={svc.user.id} service={svc} onClick={() => onOpen(svc)} />
      ))}
      <AddServiceCard onClick={() => onOpen("new")} />
    </div>
  );
}

interface ServiceCardProps {
  service: ServiceAccount;
  onClick: () => void;
}

function ServiceCard({ service, onClick }: ServiceCardProps) {
  const { user, keys } = service;
  const paused = user.banned === true;
  const keyCount = keys.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group/card relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border border-rule bg-card p-5 text-left shadow-(--shadow-card) transition-all",
        "hover:-translate-y-0.5 hover:border-accent",
        paused && "opacity-40",
      )}
    >
      {/* Line-art icon, color-tinted from service color */}
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-rule"
        style={{ color: user.color }}
        aria-hidden
      >
        <TerminalSquare className="h-5 w-5" />
      </div>

      {/* Name + role */}
      <div className="flex min-h-0 flex-col">
        <div className="truncate font-display text-2xl font-light leading-tight tracking-tight">
          {user.name}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              paused ? "bg-muted-foreground/50" : "bg-accent",
            )}
            aria-hidden
          />
          <span>{paused ? "paused" : "active"}</span>
          {user.role === "admin" && (
            <>
              <span className="opacity-50">·</span>
              <span className="font-display italic normal-case tracking-wide text-accent">
                admin
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stats footer */}
      <div className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
        {keyCount} {keyCount === 1 ? "key" : "keys"} · last active {lastActive(keys)}
      </div>
    </button>
  );
}

interface AddServiceCardProps {
  onClick: () => void;
}

export function AddServiceCard({ onClick }: AddServiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/add flex aspect-square flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-rule bg-transparent p-5 text-center transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-paper-warm/40"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-rule text-muted-foreground transition-colors group-hover/add:border-accent group-hover/add:text-accent">
        <Plus className="h-6 w-6" />
      </div>
      <div>
        <div className="font-display text-base italic text-muted-foreground transition-colors group-hover/add:text-foreground">
          Add a service account
        </div>
        <div className="mt-1 font-display text-xs italic text-muted-foreground/70">
          machine caller for other apps
        </div>
      </div>
    </button>
  );
}
