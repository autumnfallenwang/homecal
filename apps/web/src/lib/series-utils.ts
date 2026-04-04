export interface SeriesConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  repeatEvery: number;
  repeatUnit: "days" | "weeks" | "months";
  weekDays?: number[]; // 0=Mon..6=Sun
  monthDay?: number; // 1-31
}

export interface SeriesOccurrence {
  start: Date;
  end: Date;
}

function getDayOfWeekMondayBased(date: Date): number {
  return (date.getDay() + 6) % 7; // 0=Mon..6=Sun
}

export function generateSeriesDates(config: SeriesConfig): SeriesOccurrence[] {
  const results: SeriesOccurrence[] = [];
  const rangeEnd = new Date(`${config.endDate}T23:59:59`);
  const [startH, startM] = config.startTime.split(":").map(Number);
  const [endH, endM] = config.endTime.split(":").map(Number);

  const cursor = new Date(`${config.startDate}T00:00:00`);

  if (config.repeatUnit === "days") {
    while (cursor <= rangeEnd) {
      const start = new Date(cursor);
      start.setHours(startH, startM, 0, 0);
      const end = new Date(cursor);
      end.setHours(endH, endM, 0, 0);
      results.push({ start, end });
      cursor.setDate(cursor.getDate() + config.repeatEvery);
    }
  } else if (config.repeatUnit === "weeks") {
    const selectedDays = new Set(config.weekDays ?? []);
    if (selectedDays.size === 0) return results;

    // Walk week by week
    // First, align to the start of the week (Monday)
    const weekStart = new Date(cursor);
    const dayOffset = getDayOfWeekMondayBased(weekStart);
    weekStart.setDate(weekStart.getDate() - dayOffset);

    const weekCursor = new Date(weekStart);
    while (weekCursor <= rangeEnd) {
      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(weekCursor);
        dayDate.setDate(dayDate.getDate() + d);

        if (dayDate < cursor) continue;
        if (dayDate > rangeEnd) break;

        if (selectedDays.has(d)) {
          const start = new Date(dayDate);
          start.setHours(startH, startM, 0, 0);
          const end = new Date(dayDate);
          end.setHours(endH, endM, 0, 0);
          results.push({ start, end });
        }
      }
      weekCursor.setDate(weekCursor.getDate() + 7 * config.repeatEvery);
    }
  } else if (config.repeatUnit === "months") {
    const targetDay = config.monthDay ?? 1;
    const monthCursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

    while (monthCursor <= rangeEnd) {
      // Clamp to actual days in month
      const daysInMonth = new Date(
        monthCursor.getFullYear(),
        monthCursor.getMonth() + 1,
        0,
      ).getDate();
      const day = Math.min(targetDay, daysInMonth);
      const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day);

      if (date >= cursor && date <= rangeEnd) {
        const start = new Date(date);
        start.setHours(startH, startM, 0, 0);
        const end = new Date(date);
        end.setHours(endH, endM, 0, 0);
        results.push({ start, end });
      }
      monthCursor.setMonth(monthCursor.getMonth() + config.repeatEvery);
    }
  }

  return results;
}
