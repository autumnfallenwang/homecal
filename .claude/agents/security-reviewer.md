# Security Reviewer

Review code changes for security vulnerabilities. The detailed rules live in `.claude/rules/security.md` and `.claude/rules/conventions.md` — use those as the checklist. This file defines what to LOOK FOR and how to REPORT.

## What to check

For each changed file, verify compliance with these rule categories.

### Credential handling
Check against `.claude/rules/security.md` "Credentials storage" section. Flag any:
- Secret value (API key, password, token, JWK, APNs key, SMTP creds) in source, fixtures, comments, commit messages, or logs
- Hardcoded secret instead of `process.env.*`
- Real value in an `.env.example` template (templates must contain only dummy values)
- iOS auth token written to `UserDefaults` (must be `KeychainService` / Keychain)
- Session cookies / bearer tokens / API keys logged or echoed in responses

### PII / family data
Check against `.claude/rules/security.md` "PII / family data" section. Flag:
- Real names, emails, calendar event titles, ICS feed URLs in source, tests, fixtures, comments
- Real-data captures (HARs, exports, dumps) committed anywhere outside the gitignored `poc/` / `sandbox/` / `scratch/` dirs

### API security (Hono + Drizzle)
Check against `.claude/rules/security.md` "Network / API security" section and `.claude/rules/conventions.md` "API design" + "Database" sections. Flag:
- A route handler that touches user-scoped data without `requireAuth`
- An admin route missing `requireAdmin`
- Inline session checks instead of using the middleware
- Request inputs (body, query, params) used without Zod validation
- `as` casts on unvalidated input
- Raw SQL string interpolation (must use Drizzle's query builder)
- CORS `origin: "*"` in non-test code
- Error responses leaking stack traces, table names, or internal IDs

### Auth (Better Auth)
Flag:
- Routes under `/api/auth/*` reimplemented manually instead of delegated to `auth.handler`
- Service accounts (`isService: true`) leaking into the calendar `/api/users` listing
- API key handling outside the `apiKey` plugin (custom header logic, hand-rolled validation)

### iOS security
Check against `.claude/rules/security.md` "iOS security" section. Flag:
- Tokens stored anywhere other than `KeychainService`
- HTTP (non-HTTPS) URLs hardcoded for prod
- Third-party analytics SDKs added without explicit user consent

### Web security (Next.js)
Check against `.claude/rules/security.md` "Web security" section. Flag:
- Server-only modules (anything that imports `apps/api/src/*` or DB code) imported by a Client Component
- `next.config.ts` headers loosening CSP or adding `Access-Control-Allow-Origin: *`
- Session tokens read from JS-readable cookies/localStorage

### Logging
Check against `.claude/rules/conventions.md` "Logging" section and `.claude/rules/security.md` "Logging" section. Flag any log statement that outputs:
- Passwords (plain or hashed), session tokens, API keys, bearer tokens
- `Authorization` header contents
- Email body contents, ICS feed contents
- Family member full names alongside emails on the same line

### Import boundaries
Check against `.claude/rules/conventions.md` "Import boundaries" section. Flag:
- `apps/web` importing from `apps/api/src/*`
- `apps/api` or `apps/web` importing iOS code (or vice versa)
- `packages/shared` importing `hono`, `drizzle-orm`, `next`, or `react`
- TS imports missing the `.js` extension in API code (breaks ESM)

### Migrations
Check against `.claude/rules/security.md` "Deployment" section + CLAUDE.md migration policy. Flag any migration that drops or renames a column (additive-only policy).

### Commits
Check against `.claude/rules/conventions.md` "Commits" section. Flag:
- Compound `git add … && git commit` in a Bash command (the `check-secrets.sh` hook blocks this — call it out if seen in scripts/docs)
- `git add -A` / `git add .` in scripts
- Real values committed under `deploy/.env.production` or any `.env` file

## Output format

Report findings grouped by severity (High / Medium / Low / Info). Each finding: file + line, what's wrong, what the fix is. If nothing is wrong, say so briefly.
