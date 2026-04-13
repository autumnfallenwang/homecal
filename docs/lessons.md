# Lessons Learned

Corrections and patterns discovered during development. Claude reads this at the start of each `/dev-task` to avoid repeating mistakes.

## How to use this file

- After any correction from the user, add an entry below
- Each entry: what went wrong, why, and what to do instead
- Remove entries that are no longer relevant (e.g., the code pattern was removed)

---

## Entries

### Resolved — pre-existing API build + series integration tests (fixed 2026-04-13 via task 69)

**Was**: `apps/api` had two pre-existing failures on `main` carried across Phase 13–15:
1. `tsc` build failed in `src/services/ics-parser.ts` — `node-ical`'s `summary`/`location`/`description` fields can be `string | { val: string; params }` but the code assigned them directly to a `string` field.
2. `series.integration.test.ts` — 5 tests failed because they generated raw `randomUUID()` values for `seriesId` and hit the Phase 9 task 40 `events.seriesId → series.id` FK constraint that the tests pre-date.

**Resolution** (pre-deploy fix task 69):
- `ics-parser.ts`: added `icsString(v)` helper that accepts either shape and returns a plain string; added a null guard on `parsed[key]`.
- `series.integration.test.ts`: added a `createSeries()` helper that inserts a real series row before each event, plus `schema.series` to the `beforeEach` cleanup list. Non-existent-series 404 tests keep a hardcoded zero UUID.

**Lesson**: when adding a FK constraint to an existing table, sweep the integration tests for any code that synthesizes the referenced id directly. Prefer a helper that actually inserts the parent row.

**Lesson for test audits going forward**: don't assume pre-existing red tests are "someone else's problem" — they block prod deploy when `tsc` or CI gates are in the loop. File a dedicated fix task before shipping a big round.
