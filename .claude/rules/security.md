# Security Rules

## Credentials storage

- API keys, JWT secrets, DB passwords, SMTP creds, APNs keys live in:
  - **Dev**: `apps/api/.env` (gitignored, not committed)
  - **Prod**: `deploy/.env.production` (gitignored, lives only on the prod host)
- The committed templates (`apps/api/.env.example`, `deploy/.env.production.example` if present) contain dummy values ONLY. Never paste a real secret into an `.example` file.
- iOS secrets (auth tokens, session) live in **iOS Keychain** via `KeychainService`. Never `UserDefaults`, never plaintext files.
- Better Auth session tokens are HTTP-only cookies; the iOS app stores its bearer in Keychain.
- API keys are issued via Better Auth's `apiKey` plugin, prefixed `hc_`. Don't accept any other header as auth.
- Credentials NEVER in: source files, test fixtures, code comments, commit messages, logs, web-bundle JS memory.

## PII / family data

- Real family member names, emails, calendar event titles, ICS feeds, photos — never paste into source, tests, fixtures, comments, or commit messages.
- Dummy values for non-production code:
  - email: `alice@example.com`, `bob@example.com`
  - name: `Alice`, `Bob`, `Carol`, `Dave`
  - event title: `Soccer practice`, `Dentist`, `Family dinner` (generic)
  - calendar feed URL: `https://example.com/calendar.ics`
- Real-data captures (HARs, exports, dumps from a live tenant) live ONLY in gitignored `poc/`, `sandbox/`, `scratch/`. Never committed, never pasted into a PR description, never uploaded to a third-party diagram/paste site.
- The `check-secrets.sh` hook blocks staging files under those directories.

## Network / API security

- All routes that touch user-scoped data MUST be gated by `requireAuth`. Admin routes additionally chain `requireAdmin`. Use the middleware — never check the session inline.
- All inputs (body, query, params) validated with Zod. No `as` casts on unvalidated input. Drizzle queries always use the builder (parameterized) — no string-concat SQL.
- CORS origins come from `process.env.CORS_ORIGINS` (comma-separated). Never `cors({ origin: "*" })` in prod.
- Rate limiting on `/api/*` is mandatory in non-test environments. Don't add a route handler that skips it.
- Error responses: `{ error: string }` — no stack traces, no schema names, no internal IDs (the user-facing error message should not differentiate "user not found" vs "wrong password" on login).

## iOS security

- All API requests over HTTPS in prod (LAN HTTP only for dev `LocalConfig.swift`).
- Bearer tokens in Keychain (`KeychainService`). Never logged, never written to disk in plaintext.
- No third-party crash/analytics SDK that ships user content off-device without explicit consent.

## Web security (Next.js)

- Server-only modules (anything that touches `apps/api/`, secrets, DB) must never be imported into a Client Component. Use Server Components or route handlers.
- `next.config.ts` headers should set conservative defaults — no `Access-Control-Allow-Origin: *`, no unsafe-eval CSP.
- Never expose a session token to client JS beyond the Better Auth cookie flow.

## Logging — what to NEVER log

- Passwords (plain or hashed)
- Session cookies (`better-auth.session_token`), API keys, bearer tokens
- The literal contents of an `Authorization` header
- Email body contents, ICS feed contents (subject + recipient ID only)
- Family member full names alongside their emails in the same line (PII correlation)

Logging user IDs, request paths, status codes, durations, and rate-limit counters is fine.

## Deployment

- `deploy/.env.production` is the only place real prod secrets live; never commit it, never paste it.
- `homecal update` (the deploy CLI) pulls from main, rebuilds, and runs migrations. Don't run it on an unclean working tree.
- Migrations are additive only — never delete/rename columns (per CLAUDE.md). A rename masquerading as add + remove counts as a rename.
