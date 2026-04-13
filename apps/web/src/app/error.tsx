"use client";

import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-2 font-display text-xl italic">
          home<span className="not-italic font-medium">cal</span>
          <span className="text-accent">.</span>
        </div>

        <h1 className="mt-6 font-display text-4xl font-light leading-tight tracking-tight">
          Something tripped
          <br />
          on the rug
          <span className="text-accent">.</span>
        </h1>
        <p className="mt-3 font-display text-base italic text-muted-foreground">
          An unexpected error got in the way.
        </p>

        <Button type="button" onClick={reset} className="mt-6 rounded-full px-6">
          Try again
        </Button>

        {error.message && (
          <details className="mt-6 w-full rounded-md border border-rule bg-paper-warm/50 p-3 text-left">
            <summary className="cursor-pointer font-display text-xs italic text-muted-foreground">
              Details
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
              {error.message}
              {error.digest && `\n\ndigest: ${error.digest}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
