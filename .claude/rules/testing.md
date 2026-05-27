# Testing Rules

## File layout

- API tests: `apps/api/tests/<area>/<name>.test.ts` or `<name>.integration.test.ts`
  - `apps/api/tests/users/users.integration.test.ts`
  - `apps/api/tests/events/events.test.ts`
- Swift tests (when added): `apps/ios/HomeCal.swiftpm/Tests/` using Swift Testing (`@Suite`, `@Test`, `#expect`).
- Shared schema tests: `packages/shared/tests/`.
- Web tests are minimal today; if added, colocate as `*.test.tsx` next to the component.

## Fast vs full

- **Unit tests** (`.test.ts`) — pure functions, no DB, no network. Run with `pnpm test:fast`. Should be < 1s each.
- **Integration tests** (`.integration.test.ts`) — real PostgreSQL (the dev DB on port 5432), real Hono `app.request()`. Run with `pnpm test` (full).
- Never mock the database in integration tests. Past incident: a mocked-DB test passed while a Drizzle migration mistake broke prod (per CLAUDE.md philosophy on additive migrations).
- Integration tests truncate tables in `beforeEach` — see `users.integration.test.ts` for the canonical pattern (delete in FK-respecting order, then re-seed).

## Patterns

- Use `app.request(path, init)` to drive Hono — it gives you a `Response` without spinning up a real HTTP listener.
- For auth, sign up a user via `/api/auth/sign-up/email` and extract the session cookie via the `set-cookie` header. Don't bypass Better Auth.
- Tests are deterministic — no real clocks for retry/backoff; use `vi.useFakeTimers()`.
- Mock external services (SMTP, APNs, LLM) at the module boundary with `vi.mock()` — never reach a real third-party from tests.
- Test behavior, not implementation. Assert on the response shape and DB end state, not on which functions got called in what order.
- Descriptive names: `"signing up with a duplicate email returns 400"`, not `"test signup 2"`.

## Fixtures

- Sample ICS feeds, sample APNs payloads live in `apps/api/tests/<area>/fixtures/` — scrubbed of real names/emails per `.claude/rules/security.md`.
- Use the dummy values from security.md: `alice@example.com`, `Soccer practice`, etc.
- If a real-data capture is needed to write a test, drop it into `scratch/` (gitignored), scrub it, and promote it to `fixtures/`.

## What to test (priority)

1. **Auth boundaries** — every `requireAuth` / `requireAdmin` gate. Unauthenticated request returns 401, non-admin to admin route returns 403.
2. **Zod validation** — every route's request schema. Bad input returns 400 with no DB write.
3. **Business invariants** — calendar event ownership (user can only edit their own events unless admin), reminder dedup, ICS parser handles malformed input.
4. **Migrations** — additive only; a test that exercises both pre- and post-migration code paths catches accidental column drops.
5. **Rate limiting** — bypass-NODE_ENV=test in the global wiring, but spin up a mini Hono app for limiter-specific tests.

## What NOT to do

- Don't write tests that pass against a mocked DB but would fail against the real schema.
- Don't test trivial getters or pass-through code.
- Don't depend on wall-clock time, the user's locale, or DNS.
- Don't share state between tests via module-level variables — each test should set up and tear down its own DB rows.
- Don't add `.only` or `.skip` to a committed test (the lint config catches this — keep it that way).
