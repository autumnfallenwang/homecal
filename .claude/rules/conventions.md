# Coding Conventions

Rules for writing code in HomeCal. Referenced by the `dev-task` skill and `security-reviewer` / `test-writer` agents. Follow these when implementing any task.

## Import boundaries

| Package | Allowed imports | Forbidden |
|---|---|---|
| `apps/api/src/` | `hono`, `drizzle-orm`, `better-auth`, `zod`, `@homecal/shared` | Anything from `apps/web`, `apps/ios` |
| `apps/web/src/` | `next`, `react`, `@homecal/shared`, `zod` | Anything from `apps/api/src/` (server-only modules) |
| `packages/shared/src/` | `zod` only — keep this layer dependency-light | `hono`, `drizzle-orm`, `next`, `react` |
| `apps/ios/.../HomeCalKit/` | SwiftUI, Foundation, KeychainAccess | n/a |

- All TS imports use ESM-style paths with the `.js` extension (`./auth.js`, `./db/schema.js`) — required because the API runs as native ESM under Node.
- Shared types/Zod schemas live in `packages/shared`. If a type is used on both API and web/iOS, define it there.
- Never `import "@homecal/api/..."` from `apps/web` — the web bundle must not pick up server-only code.

## Naming

- TS files: kebab-case (`reminder-scheduler.ts`, not `reminderScheduler.ts`) — Biome enforces this.
- Functions/variables: camelCase.
- Types/interfaces: PascalCase.
- Constants: UPPER_SNAKE_CASE.
- DB tables: plural, snake_case (`event_logs`, `verifications`). Better Auth's `usePlural: true` requires plural names.
- API routes: kebab-case path segments (`/api/v1/service-accounts`, not `/api/v1/serviceAccounts`).
- Swift files: PascalCase matching the primary type (`CalendarViewModel.swift`).

## API design (Hono)

- Mount every route group at both `/api/<group>` (legacy) and `/api/v1/<group>` (current). Legacy paths get `Deprecation` + `Sunset` + `Link` headers via the middleware in `app.ts`. Don't add new routes under `/api/` only.
- Validate ALL request bodies, query params, and path params with Zod schemas. Reject early with 400. No `as` casts on unvalidated input.
- Auth is enforced via `requireAuth` middleware (`apps/api/src/middleware/auth.ts`). Admin-only routes additionally chain `requireAdmin`. Never check session manually inside a handler — the middleware is the gate.
- Rate limiting on `/api/*` is wired in `app.ts` and skipped under `NODE_ENV=test`. Don't bypass it for individual routes.
- Return JSON errors as `{ error: string, code?: string }` — never leak stack traces or internal table names.
- Use Better Auth's session shape (`c.get("session")`, `c.get("user")`) — never roll your own session lookup.

## Database (Drizzle)

- Schema lives in `apps/api/src/db/schema.ts`. **Migrations are additive only** — no column rename/delete (prod migration policy in CLAUDE.md).
- Always parameterize. Use Drizzle's query builder (`db.select().from(...).where(eq(...))`); no raw SQL string interpolation.
- For new tables, follow the existing conventions: snake_case names, UUID PKs (default via PostgreSQL), `createdAt`/`updatedAt` timestamps with default `now()`.
- Per-request DB access goes through the singleton in `apps/api/src/db/index.ts`. Tests open their own connection — never reuse the prod connection.

## Auth (Better Auth)

- All auth routes live under `/api/auth/*` (Better Auth handles them) — never reimplement signup/signin/session lookup.
- Service accounts: `isService: true` on the user record, accessed via the `/api/admin/service-accounts` route. Filter them out of the family calendar `/api/users` listing.
- API keys: prefix `hc_`, header `x-api-key`. The `apiKey` plugin attaches a Session for valid keys so the standard `requireAuth` middleware accepts them.
- Sessions: 7-day expiry, refresh daily. Don't override on a per-route basis.

## Error handling

- API: catch at the route boundary; map known errors to 4xx, unknown errors to 500 with a generic message; log the technical detail server-side.
- Web: surface auth/data errors with the existing toast/alert pattern; never `console.error` and leave the user with a blank screen.
- Swift: `do/try/catch` around every `APIClient` call. Surface failures via `@Published` state on the relevant ViewModel.

## Logging

- API: `console.log` / `console.error` is acceptable today (single-process Node) — keep messages structured-ish: `console.log("reminder-scheduler: sent email user=<id>")`. If structured logging is added later, this section should migrate.
- Web: keep prod-bundle `console.*` minimal. Dev-only logs are fine.
- Swift: `print(...)` for dev; replace with `os_log` if/when noise becomes an issue.

### Never log
- Passwords (plain or hashed)
- Session tokens, Better Auth cookies, API keys
- Bearer tokens, `Authorization` header contents
- Stripe/payment tokens (if/when integrated)
- Email body contents (subject + recipient ID is fine)

## iOS conventions (Swift)

- One type per file; file name matches the primary type.
- Views are SwiftUI `View` structs; business logic lives in `ObservableObject` ViewModels (`CalendarViewModel`, etc).
- Secrets in `KeychainService` (Keychain), never `UserDefaults`.
- API base URL comes from `LocalConfig.swift` (gitignored) — the `.example` template is checked in.
- SwiftLint clean before commit; auto-fix runs via the format-after-write hook.

## Commits

- Stage specific files with `git add <path>`, never `git add -A` / `git add .` — prevents accidentally committing `.env` or scratch files.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Append to the commit body: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- Never commit: `.env` (except `.env.example`), `deploy/.env.production`, the gitignored `poc/`, `ref/`, `sandbox/`, `scratch/` directories, captured HARs, real user data exports.
- Compound `git add … && git commit` invocations are blocked by the `check-secrets.sh` hook — split them into two separate commands.
