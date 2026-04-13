"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { Member } from "@/hooks/use-members";
import { MemberChip } from "./member-chip";

interface MemberFilterProps {
  members: Member[];
  isLoading: boolean;
  visibleMemberIds: Set<string>;
  onToggle: (memberId: string) => void;
  onOnlyMe?: () => void;
  onEveryone?: () => void;
}

export function MemberFilter({
  members,
  isLoading,
  visibleMemberIds,
  onToggle,
  onOnlyMe,
  onEveryone,
}: MemberFilterProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-16" />
        <div className="flex flex-wrap gap-2 lg:flex-col">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3 lg:gap-4 lg:py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-sm italic tracking-wide text-muted-foreground">Family</h3>
        {(onOnlyMe || onEveryone) && (
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {onOnlyMe && (
              <button
                type="button"
                onClick={onOnlyMe}
                className="rounded-full px-1 transition-colors hover:text-accent"
              >
                Only me
              </button>
            )}
            {onOnlyMe && onEveryone && <span className="opacity-50">·</span>}
            {onEveryone && (
              <button
                type="button"
                onClick={onEveryone}
                className="rounded-full px-1 transition-colors hover:text-accent"
              >
                Everyone
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-row flex-wrap gap-1.5 lg:flex-col lg:gap-1">
        {members.map((member) => (
          <MemberChip
            key={member.id}
            member={member}
            checked={visibleMemberIds.has(member.id)}
            onClick={() => onToggle(member.id)}
          />
        ))}
      </div>
    </div>
  );
}
