/**
 * Parse a BCP-47 locale tag (`en-US`, `zh-Hant-TW`, `fr`) and return the
 * uppercased ISO 3166-1 alpha-2 region subtag, or null if there isn't one.
 *
 * Used by the holidays feature to seed a default country preference on first
 * visit. Kept in `@homecal/shared` so the frontend can mirror the behavior
 * without re-implementing the logic.
 */
export function localeToCountry(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const trimmed = locale.trim();
  if (!trimmed) return null;
  // BCP-47 region subtag is always an uppercase 2-letter code (ISO 3166-1
  // alpha-2) or a 3-digit UN M.49 code. HomeCal only supports the alpha-2
  // form (date-holidays keys on it), so we ignore numeric regions.
  const parts = trimmed.split(/[-_]/);
  for (const part of parts.slice(1)) {
    if (/^[A-Za-z]{2}$/.test(part)) {
      return part.toUpperCase();
    }
  }
  return null;
}

/**
 * Parse a full `Accept-Language` header value (`en-US,en;q=0.9,zh-TW;q=0.8`)
 * and return the country code of the highest-priority locale with a region
 * subtag, or null if none.
 */
export function acceptLanguageToCountry(header: string | null | undefined): string | null {
  if (!header) return null;
  const parts = header
    .split(",")
    .map((token) => {
      const [tag, ...params] = token.trim().split(";");
      let q = 1;
      for (const p of params) {
        const [k, v] = p.split("=").map((s) => s.trim());
        if (k === "q" && v) {
          const parsed = Number.parseFloat(v);
          if (Number.isFinite(parsed)) q = parsed;
        }
      }
      return { tag: tag.trim(), q };
    })
    .filter((p) => p.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of parts) {
    const country = localeToCountry(tag);
    if (country) return country;
  }
  return null;
}
