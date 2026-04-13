export default function Loading() {
  return (
    <output
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-8"
      aria-label="Loading"
    >
      <div className="font-display text-2xl italic">
        home<span className="not-italic font-medium">cal</span>
        <span className="text-accent">.</span>
      </div>
      <div className="flex items-center gap-1.5 motion-safe:animate-pulse">
        <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
      </div>
      <p className="font-display text-sm italic text-muted-foreground">one moment…</p>
    </output>
  );
}
