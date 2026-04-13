"use client";

import { Plus } from "lucide-react";

interface InviteCardProps {
  onClick?: () => void;
}

export function InviteCard({ onClick }: InviteCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/invite flex aspect-[4/5] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-rule bg-transparent p-5 text-center transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-paper-warm/40"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-rule text-muted-foreground transition-colors group-hover/invite:border-accent group-hover/invite:text-accent">
        <Plus className="h-7 w-7" />
      </div>
      <div>
        <div className="font-display text-lg italic text-muted-foreground transition-colors group-hover/invite:text-foreground">
          Add a family member
        </div>
        <div className="mt-1 font-display text-xs italic text-muted-foreground/70">
          invite by name + color
        </div>
      </div>
    </button>
  );
}
