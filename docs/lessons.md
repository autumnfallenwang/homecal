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

### Better Auth `apiKey` plugin gotchas (noted 2026-04-13, task 70)

Three things that aren't obvious from the docs:

1. **Plural table naming under `usePlural: true`** — Better Auth's drizzle adapter resolves the apiKey model as `schema.apikeys` when the adapter has `usePlural: true`. The Drizzle export AND the SQL `pgTable("apikeys", ...)` must both be plural. Singular `apikey` produces `BetterAuthError: The model "apikeys" was not found in the schema object`. Service-to-service pattern: one service user per calling app, store its api key as a shared secret in the caller's env.

2. **Cross-user key creation requires headerless calls** — `auth.api.createApiKey({ body: { userId: ... }, headers })` THROWS `UNAUTHORIZED_SESSION` when the resolved session user doesn't match `body.userId`. Even an admin can't create keys for other users via the session-passing path. Workaround: in trusted server-side code (after your own admin gate), call `auth.api.createApiKey({ body })` **without** passing headers. BA treats that as a trusted call and uses `body.userId` directly.

3. **`enableSessionForAPIKeys` defaults to false** — if you want `auth.api.getSession({ headers })` to resolve `x-api-key` headers into a session, you have to set this option explicitly. Without it, the existing `requireAuth` middleware silently fails to authenticate api-key callers.

4. **Deleted/expired keys throw `APIError`, not `null`** — `auth.api.getSession` can throw when an x-api-key header is invalid. `requireAuth` should wrap the call in `try/catch` and return 401, otherwise the error bubbles up as a 500 from Hono's default handler.

### OpenAPI: handwritten spec beats `@hono/zod-openapi` migration (noted 2026-04-13, task 73)

**Original plan**: migrate every route from `new Hono()` to `new OpenAPIHono()` + `createRoute({ method, path, request, responses })` so the spec is generated from real handlers.

**What I shipped instead**: hand-curated `apps/api/src/openapi/spec.ts` returning a static OpenAPI 3.1 object, with `components.schemas` derived from existing `@homecal/shared` Zod schemas via `zod-to-json-schema` (target `openApi3`). Mounted at `GET /api/openapi.json` + `GET /api/docs` (Swagger UI loaded from a CDN — no `@hono/swagger-ui` dep). 9 integration tests assert the structure.

**Why**: the route migration would have touched events.ts (300+ lines), series.ts, reminders.ts, devices.ts, admin.ts, users.ts — every handler signature, every middleware chain, every test setup. ~5h of mechanical risk for documentation. The hand-curated approach took ~1h, ships the same Swagger UI, and produces an OpenAPI spec good enough for `openapi-typescript` to generate clients. Better Auth's `/api/auth/*` routes can't be migrated anyway.

**Drawback**: the spec drifts from reality if a route changes without updating the spec file. Mitigation: integration test asserts presence of expected paths so adding a new route surfaces a failure as soon as the test list is updated, and the spec file lives alongside the routes in `apps/api/src/openapi/`.

**Lesson**: when tooling demands a full handler rewrite for a docs feature, write the docs by hand and revisit if/when a real reason to migrate appears (e.g. needing per-handler OpenAPI overrides at scale).

### Service account = user + throwaway password (GitHub PAT mental model, noted 2026-04-13, Phase 17)

**Question that kept coming up**: "why do we need both a service account AND an API key? pick one."

**Answer**: HomeCal uses the GitHub PAT pattern. A "service account" is just a normal user record with `isService=true`. The password is 32 bytes of `randomBytes` — generated at create time, hashed, and **never returned or used again**. The real credential is the API key minted *under that user*. The user record exists as a permission anchor — its `role` determines whether keys minted under it can hit admin-gated routes (mirrors GitHub where a PAT inherits the owning user's permissions).

**Why not bearer tokens on a shared user?** Bearer sessions are browser-shaped: short TTL, cookie-flavored, tied to sign-in flows. Service callers need long-lived, revocable-per-caller credentials where rotating one doesn't kick the other callers out. That's what `apiKey` rows give you: name, owner, last-request, request-count, enabled flag — all per key.

**Why the throwaway password then?** Better Auth's `createUser` requires a password field. Rather than carving out a special "no-password user" path, generate garbage and discard it. `isService=true` + the `/api/users` filter (`WHERE isService=false`) hides the user from the family calendar so it never shows up as an assignee.

**The invariant**: one service user per calling app, N keys per service. Rotation is "mint new, migrate caller, delete old" — the old key authenticates during the grace window, no scheduled-deletion complexity.
