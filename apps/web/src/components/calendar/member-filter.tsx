"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { Member } from "@/hooks/use-members";

interface MemberFilterProps {
  members: Member[];
  isLoading: boolean;
  visibleMemberIds: Set<string>;
  onToggle: (memberId: string) => void;
}

export function MemberFilter({
  members,
  isLoading,
  visibleMemberIds,
  onToggle,
}: MemberFilterProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Family</h3>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Family</h3>
      {members.map((member) => (
        <div key={member.id} className="flex cursor-pointer items-center gap-2">
          <Checkbox
            id={`member-${member.id}`}
            checked={visibleMemberIds.has(member.id)}
            onCheckedChange={() => onToggle(member.id)}
          />
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: member.color }} />
          <label htmlFor={`member-${member.id}`} className="cursor-pointer text-sm">
            {member.name}
          </label>
        </div>
      ))}
    </div>
  );
}
