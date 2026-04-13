"use client";

const DAY_HEADERS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function MonthGridSkeleton() {
  return (
    <output className="flex flex-1 flex-col" aria-busy="true" aria-label="Loading calendar">
      <div className="grid grid-cols-7 border-b border-rule px-1">
        {DAY_HEADERS.map((day, i) => (
          <div
            key={day}
            className={`px-4 py-3 font-display text-sm italic tracking-wide md:text-base ${
              i >= 5 ? "text-accent/80" : "text-muted-foreground"
            }`}
          >
            <span className="hidden md:inline">{day}</span>
            <span className="md:hidden">{day.slice(0, 3)}</span>
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {Array.from({ length: 42 }).map((_, i) => {
          const col = i % 7;
          const isWeekend = col >= 5;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid
              key={i}
              className={`min-h-28 border-b border-r border-rule px-3 pt-2 pb-2 motion-safe:animate-pulse md:min-h-32 xl:min-h-40 ${
                isWeekend ? "bg-paper-warm" : ""
              }`}
              style={{ animationDelay: `${(i % 12) * 60}ms` }}
            >
              <div className="h-7 w-8 rounded-sm bg-muted/60" />
              <div className="mt-3 flex flex-col gap-1">
                <div className="h-3 w-3/4 rounded-sm bg-muted/40" />
                {i % 3 === 0 && <div className="h-3 w-1/2 rounded-sm bg-muted/30" />}
              </div>
            </div>
          );
        })}
      </div>
    </output>
  );
}
