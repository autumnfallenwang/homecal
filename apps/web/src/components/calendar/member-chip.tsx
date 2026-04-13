"use client";

import type { Member } from "@/hooks/use-members";
import { cn } from "@/lib/utils";

interface MemberChipProps {
  member: Member;
  checked: boolean;
  onClick: () => void;
  size?: "sm" | "md";
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "·";
}

export function MemberChip({ member, checked, onClick, size = "md" }: MemberChipProps) {
  const avatarSize = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full p-1 pr-3 transition-all",
        checked ? "bg-paper-warm/70 hover:bg-paper-warm" : "opacity-45 hover:opacity-90",
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full font-display text-xs font-medium transition-all",
          avatarSize,
          checked ? "text-white" : "bg-background ring-1 ring-inset",
        )}
        style={
          checked
            ? { backgroundColor: member.color }
            : { color: member.color, borderColor: member.color }
        }
      >
        {initial(member.name)}
      </span>
      <span className={cn("font-medium", textSize)}>{member.name}</span>
    </button>
  );
}
