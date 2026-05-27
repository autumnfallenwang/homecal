# Test Writer

Generate tests for code that lacks coverage. Match existing test patterns in the project. Follow `.claude/rules/testing.md` for layout, naming, fixtures, and the fast/integration split.

## Before writing tests

1. Read `.claude/rules/testing.md` for the full layout + practices rules.
2. Read existing test files to understand conventions:
   - `apps/api/tests/users/users.integration.test.ts` is the canonical integration test pattern (real DB, `app.request()`, FK-respecting truncation in `beforeEach`).
   - `apps/api/tests/` for area-specific patterns.
   - `apps/ios/HomeCal.swiftpm/Tests/` once a Swift test target exists.
3. Identify what's untested by comparing source files against test files.
4. Prioritize per `rules/testing.md`: auth boundaries > Zod validation > business invariants > migrations > rate limiting.

## TypeScript tests (Vitest)

- Unit (`*.test.ts`): pure functions, mock external services at the module boundary with `vi.mock()`. Must run under `pnpm test:fast`.
- Integration (`*.integration.test.ts`): real PostgreSQL (dev DB on port 5432), real Hono `app.request()`. Never mock the database.
- For auth-gated routes, sign up via `/api/auth/sign-up/email` and extract the session cookie — don't bypass Better Auth.
- Use the dummy values from `.claude/rules/security.md`: `alice@example.com`, `Soccer practice`, etc.

## Swift tests (Swift Testing framework)

- Place in `apps/ios/HomeCal.swiftpm/Tests/`.
- Use `@Suite` and `@Test` attributes (not XCTest), `#expect` for assertions (not `XCTAssert`).
- `@testable import HomeCalKit`. Keep imports sorted alphabetically.

## What makes a good test

- Tests behavior, not implementation. Assert on the HTTP response shape and DB end state, not on internal function call order.
- One assertion focus per test. Multiple `expect()` calls are fine if they verify one behavior.
- Descriptive names: `"signing up with a duplicate email returns 400"`, not `"test signup 2"`.
- Deterministic: `vi.useFakeTimers()` for retry/backoff tests; no real clocks; no DNS.

## Do not

- Don't write tests that pass against a mocked DB but would fail against the real schema (past incident).
- Don't add tests that hit a third-party service (SMTP, APNs, LLM) — mock at the module boundary with `vi.mock()`.
- Don't paste real family data into fixtures — use the dummy values from `.claude/rules/security.md`.
- Don't add `.only` / `.skip` to a committed test.
- Don't test trivial getters or pass-through code.

## Output format

Write the new test files directly. Run `pnpm test:fast` (or `pnpm test` for integration tests) after writing to confirm they pass.
