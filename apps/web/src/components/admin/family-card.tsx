"use client";

import { cn } from "@/lib/utils";

export interface FamilyMember {
  id: string;
  name: string;
  email: string;
  color: string;
  role: string;
  banned: boolean;
  createdAt: string;
}

interface FamilyCardProps {
  member: FamilyMember;
  isSelf: boolean;
  onClick?: () => void;
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "·";
}

function joinedLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function FamilyCard({ member, isSelf, onClick }: FamilyCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group/card relative flex aspect-[4/5] flex-col items-center justify-between overflow-hidden rounded-2xl border border-rule bg-card p-5 text-center shadow-(--shadow-card) transition-all",
        "hover:-translate-y-0.5 hover:border-accent",
        member.banned && "opacity-40",
      )}
    >
      {member.banned && (
        <span
          className="pointer-events-none absolute -right-8 top-4 rotate-45 bg-destructive px-10 py-0.5 font-display text-[9px] uppercase tracking-widest text-white"
          aria-hidden
        >
          paused
        </span>
      )}

      {/* Avatar */}
      <div
        className="mt-2 flex h-16 w-16 items-center justify-center rounded-full font-display text-2xl font-light text-white"
        style={{ backgroundColor: member.color }}
        aria-hidden
      >
        {initial(member.name)}
      </div>

      {/* Identity */}
      <div className="flex min-h-0 flex-col items-center">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-display text-[22px] font-light leading-tight tracking-tight">
            {member.name}
          </span>
          {isSelf && (
            <span className="rounded-full border border-accent/40 px-1.5 py-0.5 font-display text-[9px] italic text-accent">
              you
            </span>
          )}
        </div>
        <div className="mt-0.5 w-full truncate text-[11px] text-muted-foreground">
          {member.email}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              member.banned ? "bg-muted-foreground/50" : "bg-accent",
            )}
            aria-hidden
          />
          <span>{member.banned ? "paused" : "active"}</span>
          {member.role === "admin" && (
            <>
              <span className="opacity-50">·</span>
              <span className="font-display italic normal-case tracking-wide text-accent">
                admin
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="font-display text-xs italic text-muted-foreground">
        joined {joinedLabel(member.createdAt)}
      </div>
    </button>
  );
}
