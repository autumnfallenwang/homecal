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
          <div key={i} className="flex items-start gap-2 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-muted mt-1.5 shrink-0" />
            <div className="space-y-1 flex-1">
              <div className="h-3 bg-muted rounded w-3/4" />
              <div className="h-2 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">No change history.</p>;
  }

  return (
    <div className="max-h-48 overflow-y-auto space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-2 text-sm">
          <span
            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
            style={{ backgroundColor: log.user.color }}
          />
          <div className="min-w-0">
            <span className="font-medium">{log.user.name}</span>{" "}
            <span className="text-muted-foreground">
              {log.action} · {formatTimestamp(log.timestamp)}
            </span>
            {log.action === "updated" && log.changes && (
              <ul className="mt-0.5 text-xs text-muted-foreground list-disc list-inside">
                {Object.entries(log.changes).map(([field, { from, to }]) => (
                  <li key={field}>{formatFieldChange(field, from, to)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
