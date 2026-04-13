# Lessons Learned

Corrections and patterns discovered during development. Claude reads this at the start of each `/dev-task` to avoid repeating mistakes.

## How to use this file

- After any correction from the user, add an entry below
- Each entry: what went wrong, why, and what to do instead
- Remove entries that are no longer relevant (e.g., the code pattern was removed)

---

## Entries

### Pre-existing broken API build + series integration tests (noted 2026-04-13)

**State**: `apps/api` has two pre-existing issues on `main` that are unrelated to any current task:

1. **`tsc` build fails** in `src/services/ics-parser.ts` — 4 TS2322/TS18048 errors where `node-ical`'s `ParameterValue<string, ...>` type is being assigned to `string` without `.val` extraction. Lines 44, 77, 80, 81.
2. **`tests/events/series.integration.test.ts`** — 5 tests fail with `SyntaxError: Unexpected token 'I', "Internal S"...` because the server returns `Internal Server Error` HTML (not JSON) when creating series. Something in the `/api/events` or `/api/series` POST handler is throwing under test. Pre-existing.

**Why this matters**: when running `/check all` or `pnpm --filter @homecal/api build`, these will fail regardless of what the current task did. Verify failures are *new* by running `git stash && pnpm build && git stash pop` before assuming a regression.

**Don't fix as a side effect** of an unrelated task — file a dedicated task to address these, since fixing them touches different code paths and deserves its own commit.
