const DAYS_IN_GRID = 42; // 6 rows x 7 cols

/**
 * Returns 42 dates (6 rows x 7 cols) for a month grid starting on Monday.
 */
export function getMonthGridDates(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  // getDay(): 0=Sun, 1=Mon ... 6=Sat → shift so Mon=0
  const dayOfWeek = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - dayOfWeek);

  const dates: Date[] = [];
  for (let i = 0; i < DAYS_IN_GRID; i++) {
    dates.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return dates;
}

export function getGridStart(gridDates: Date[]): string {
  return gridDates[0].toISOString();
}

export function getGridEnd(gridDates: Date[]): string {
  const last = gridDates[gridDates.length - 1];
  // End of the last day (start of next day)
  return new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).toISOString();
}

export function isSameMonth(date: Date, year: number, month: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month;
}

export function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function formatMonthYear(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Returns 7 dates (Mon–Sun) for the week containing `date`.
 */
export function getWeekDates(date: Date): Date[] {
  const dayOfWeek = (date.getDay() + 6) % 7; // Mon=0
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek);
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  }
  return dates;
}

export function getWeekStart(weekDates: Date[]): string {
  return weekDates[0].toISOString();
}

export function getWeekEnd(weekDates: Date[]): string {
  const last = weekDates[weekDates.length - 1];
  return new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).toISOString();
}

export function getDayStart(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
}

export function getDayEnd(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString();
}

export function formatDayTitle(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatWeekRange(weekDates: Date[]): string {
  const first = weekDates[0];
  const last = weekDates[weekDates.length - 1];
  const monthShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  const year = last.getFullYear();

  if (first.getMonth() === last.getMonth()) {
    return `${monthShort(first)} ${first.getDate()} – ${last.getDate()}, ${year}`;
  }
  return `${monthShort(first)} ${first.getDate()} – ${monthShort(last)} ${last.getDate()}, ${year}`;
}
