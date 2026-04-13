import type { Holiday } from "@homecal/shared";
import Holidays from "date-holidays";

/**
 * Holidays are computed on-the-fly from `date-holidays` — no DB, no sync job.
 * This service iterates year ranges, filters to public holidays, clips to the
 * requested window, and merges duplicates across countries so the calendar
 * renders one kicker line per date. See docs/design-plan.md Phase 18.
 */

// One Holidays instance per country code. Construction parses rule tables so
// we cache them for the lifetime of the process.
const instanceCache = new Map<string, Holidays>();

function getInstance(country: string): Holidays {
  const existing = instanceCache.get(country);
  if (existing) return existing;
  const instance = new Holidays(country);
  instanceCache.set(country, instance);
  return instance;
}

// Country code set — validated lazily because `new Holidays()` (no args) plus
// `getCountries()` is only called once and the result is stable.
let knownCountries: Set<string> | null = null;
function getKnownCountries(): Set<string> {
  if (!knownCountries) {
    const all = new Holidays().getCountries() as Record<string, string>;
    knownCountries = new Set(Object.keys(all));
  }
  return knownCountries;
}

export function isKnownCountry(code: string): boolean {
  return getKnownCountries().has(code);
}

// Public list of `{ code, name }` for the settings UI. Cached for the
// lifetime of the process — the underlying data is static per release.
let countryList: Array<{ code: string; name: string }> | null = null;
export function listCountries(): Array<{ code: string; name: string }> {
  if (countryList) return countryList;
  const raw = new Holidays().getCountries() as Record<string, string>;
  countryList = Object.entries(raw)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return countryList;
}

// Small FIFO cache so month + week views hitting the same window don't
// recompute. Keyed by normalized (sorted countries, from, to). 100 entries is
// more than enough for a family calendar's typical navigation.
const MAX_CACHE = 100;
const resultCache = new Map<string, Holiday[]>();

function cacheKey(countries: string[], from: string, to: string): string {
  return `${[...countries].sort().join(",")}|${from}|${to}`;
}

interface GetHolidaysArgs {
  countries: string[]; // ISO 3166-1 alpha-2, uppercase
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

interface Bucket {
  titles: string[];
  countries: Set<string>;
}

function collectCountry(
  buckets: Map<string, Bucket>,
  country: string,
  from: string,
  to: string,
  startYear: number,
  endYear: number,
): void {
  const hd = getInstance(country);
  for (let year = startYear; year <= endYear; year++) {
    const raw = (hd.getHolidays(year) ?? []) as Array<{
      date: string;
      name: string;
      type: string;
    }>;
    for (const h of raw) {
      if (h.type !== "public") continue;
      const date = h.date.slice(0, 10);
      if (date < from || date > to) continue;
      let bucket = buckets.get(date);
      if (!bucket) {
        bucket = { titles: [], countries: new Set() };
        buckets.set(date, bucket);
      }
      if (!bucket.titles.includes(h.name)) bucket.titles.push(h.name);
      bucket.countries.add(country);
    }
  }
}

function validateArgs({ countries, from, to }: GetHolidaysArgs): void {
  for (const c of countries) {
    if (!isKnownCountry(c)) {
      throw new Error(`Unknown country code: ${c}`);
    }
  }
  if (from > to) {
    throw new Error("`from` must be <= `to`");
  }
}

function storeInCache(key: string, value: Holiday[]): void {
  if (resultCache.size >= MAX_CACHE) {
    const firstKey = resultCache.keys().next().value;
    if (firstKey !== undefined) resultCache.delete(firstKey);
  }
  resultCache.set(key, value);
}

/**
 * Fetch public holidays for a country list within a date range.
 * Throws if any country code is unknown — caller converts to 400.
 */
export function getHolidays(args: GetHolidaysArgs): Holiday[] {
  validateArgs(args);
  const { countries, from, to } = args;

  const key = cacheKey(countries, from, to);
  const cached = resultCache.get(key);
  if (cached) return cached;

  const startYear = Number.parseInt(from.slice(0, 4), 10);
  const endYear = Number.parseInt(to.slice(0, 4), 10);

  const buckets = new Map<string, Bucket>();
  for (const country of countries) {
    collectCountry(buckets, country, from, to, startYear, endYear);
  }

  const out: Holiday[] = [...buckets.entries()]
    .map(([date, { titles, countries: cs }]) => ({
      date,
      title: titles.join(" · "),
      countries: [...cs].sort(),
      type: "public" as const,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  storeInCache(key, out);
  return out;
}

// Test hook — lets the unit tests reset the cache between cases.
// biome-ignore lint/style/useNamingConvention: leading-underscore convention flags this as a test-only export
export function _resetHolidaysCache(): void {
  resultCache.clear();
}
