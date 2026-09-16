/**
 * Classifying errors thrown out of Better Auth's `getSession`.
 *
 * `getSession` throws an `APIError` for several unrelated conditions, and we
 * previously collapsed all of them to 401. That cost real debugging time: the
 * apiKey plugin's per-key rate limit (default 10 requests / 24h) surfaced as
 * "Unauthorized", so an exhausted quota was indistinguishable from a bad key.
 * A throttle must announce itself as a throttle.
 */

/** Shape we care about on Better Auth's APIError; it is not exported cleanly. */
interface MaybeApiError {
  status?: unknown;
  statusCode?: unknown;
  body?: { code?: unknown; message?: unknown } | null;
  message?: unknown;
}

/**
 * True when the error represents "too many requests" rather than a failed
 * credential. Matches defensively — Better Auth has expressed this as a
 * numeric status, a SCREAMING_CASE status string, and a body code across
 * versions, so key off any of them rather than one exact shape.
 */
export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as MaybeApiError;

  if (e.status === 429 || e.statusCode === 429) return true;

  const haystack = [e.status, e.body?.code, e.body?.message, e.message]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toUpperCase();

  return (
    haystack.includes("TOO_MANY_REQUESTS") ||
    haystack.includes("TOO MANY REQUESTS") ||
    haystack.includes("RATE_LIMIT") ||
    haystack.includes("RATE LIMIT")
  );
}
