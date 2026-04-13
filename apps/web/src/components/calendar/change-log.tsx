import type { EventLogEntry } from "@/hooks/use-event-logs";

interface ChangeLogProps {
  logs: EventLogEntry[];
  isLoading: boolean;
}

function formatTimestamp(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatFieldChange(field: string, from: unknown, to: unknown): string {
  if (field === "title") {
    return `title: "${String(from)}" → "${String(to)}"`;
  }
  if (field === "start" || field === "end") {
    return `${field}: ${new Date(String(from)).toLocaleString()} → ${new Date(String(to)).toLocaleString()}`;
  }
  if (field === "private") {
    return `visibility: ${from ? "private" : "shared"} → ${to ? "private" : "shared"}`;
  }
  return `${field}: ${String(from)} → ${String(to)}`;
}

export function ChangeLog({ logs, isLoading }: ChangeLogProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-start gap-2 motion-safe:animate-pulse">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-3/4 rounded bg-muted" />
              <div className="h-2 w-1/2 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return <p className="font-display text-sm italic text-muted-foreground">No change history.</p>;
  }

  return (
    <div className="max-h-48 space-y-2.5 overflow-y-auto pr-2">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-2.5 text-sm">
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-background"
            style={{ backgroundColor: log.user.color, boxShadow: `0 0 0 1px ${log.user.color}30` }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{log.user.name}</span>
              <span className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
                {log.action}
              </span>
              <span className="ml-auto shrink-0 font-display text-xs italic text-ink-faint">
                {formatTimestamp(log.timestamp)}
              </span>
            </div>
            {log.action === "updated" && log.changes && (
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {Object.entries(log.changes).map(([field, { from, to }]) => (
                  <li key={field} className="truncate">
                    <span className="text-accent">·</span> {formatFieldChange(field, from, to)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
