# HomeCal — Progress

## Phase 1: Core (web UI + manual input)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Monorepo scaffold | ✅ Done | Turborepo + pnpm, Hono API + Next.js Web + shared package, Biome + Vitest |
| 2 | PostgreSQL + Drizzle ORM schema | ✅ Done | Docker scripts, Drizzle schema (users/events/event_logs), drizzle-kit config |
| 3 | Better Auth setup | ✅ Done | Email+password, session cookies, admin role, first-user-admin hook |
| 4 | CRUD events API | ✅ Done | 5 REST endpoints, shared Zod schemas, visibility rules, change logging (103 tests) |
| 5 | Calendar web UI | Not started | Monthly/weekly view, create/edit/delete events, filter by member |
| 6 | Event change log | Not started | Log all edits to shared events, display history in event detail |
| 7 | LAN deploy | Not started | Bind to 0.0.0.0, family access via local network |

## What's Working

- Monorepo structure: `apps/api` (Hono, port 3001), `apps/web` (Next.js, port 3000), `packages/shared`
- `pnpm dev` starts both servers in parallel via Turborepo
- `pnpm lint` passes across all 3 packages (Biome 2.4.4, React/Next.js domains)
- `pnpm test` runs Vitest on API package (103 tests: schema + auth + events CRUD)
- Health check: `GET /health` → `{"status":"ok"}`
- Docker PostgreSQL: `scripts/db-start.sh` / `db-stop.sh` / `db-reset.sh`
- Drizzle schema: `users`, `sessions`, `accounts`, `verifications`, `events`, `event_logs` tables with relations + indexes
- Drizzle-kit: `pnpm --filter @homecal/api db:generate` / `db:migrate` / `db:studio`
- Better Auth: email+password signup/signin, session cookies, admin plugin
- Auth routes: `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`
- `requireAuth` middleware for protected routes
- First registered user auto-promoted to admin role
- CORS configured with credentials for frontend origin
- Events CRUD API: `POST/GET/PATCH/DELETE /api/events`, `GET /api/events/:id`
- Shared Zod schemas in `packages/shared`: `createEventSchema`, `updateEventSchema`, `eventQuerySchema`
- Visibility rules: shared events visible to all, private events only to owner (404 to others)
- Field-level change logging in `event_logs` for shared event mutations
- Date range filtering on `GET /api/events?from=...&to=...`

## What's Next

Task 5: Calendar web UI — Monthly/weekly view, create/edit/delete events, filter by member.

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, build phases
