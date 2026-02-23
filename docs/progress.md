# HomeCal — Progress

## Phase 1: Core (web UI + manual input)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Monorepo scaffold | ✅ Done | Turborepo + pnpm, Hono API + Next.js Web + shared package, Biome + Vitest |
| 2 | PostgreSQL + Drizzle ORM schema | ✅ Done | Docker scripts, Drizzle schema (users/events/event_logs), drizzle-kit config |
| 3 | Better Auth setup | Not started | Email+password, session cookies, admin role |
| 4 | CRUD events API | Not started | Hono endpoints: create, read, update, delete events |
| 5 | Calendar web UI | Not started | Monthly/weekly view, create/edit/delete events, filter by member |
| 6 | Event change log | Not started | Log all edits to shared events, display history in event detail |
| 7 | LAN deploy | Not started | Bind to 0.0.0.0, family access via local network |

## What's Working

- Monorepo structure: `apps/api` (Hono, port 3001), `apps/web` (Next.js, port 3000), `packages/shared`
- `pnpm dev` starts both servers in parallel via Turborepo
- `pnpm lint` passes across all 3 packages (Biome 2.4.4, React/Next.js domains)
- `pnpm test` runs Vitest on API package (9 schema tests)
- Health check: `GET /health` → `{"status":"ok"}`
- Docker PostgreSQL: `scripts/db-start.sh` / `db-stop.sh` / `db-reset.sh`
- Drizzle schema: `users`, `events`, `event_logs` tables with relations + indexes
- Drizzle-kit: `pnpm --filter @homecal/api db:generate` / `db:migrate` / `db:studio`

## What's Next

Task 3: Better Auth setup — email+password, session cookies, admin role.

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, build phases
