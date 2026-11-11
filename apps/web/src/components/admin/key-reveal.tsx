"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { copyText, selectElementText } from "@/lib/clipboard";

/**
 * One-time key reveal for a device key (Phase 23). Same rules as the service
 * account drawer: the key is auto-selected the moment it appears so Ctrl/Cmd+C
 * always works, and a refused clipboard write is reported, never swallowed —
 * over plain HTTP `navigator.clipboard` doesn't exist.
 */
export function KeyReveal({
  label,
  plaintext,
  hint,
  onDismiss,
}: {
  label: string;
  plaintext: string;
  hint?: string;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    selectElementText(ref.current);
  }, []);

  const copy = async () => {
    const ok = await copyText(plaintext, ref.current);
    setFailed(!ok);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-xs italic text-muted-foreground">
          {label} — copy it now, it won&rsquo;t be shown again
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <code
          ref={ref}
          className="w-full select-all break-all rounded bg-background px-2 py-1 font-mono text-xs"
        >
          {plaintext}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void copy()}
          className="rounded-full"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </Button>
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      {failed && (
        <p className="mt-2 text-xs text-destructive">
          Couldn&rsquo;t reach the clipboard — the key above is already selected, just press
          Ctrl/Cmd+C. (Browsers block clipboard access on non-HTTPS pages.)
        </p>
      )}
    </div>
  );
}
