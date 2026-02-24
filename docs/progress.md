# HomeCal — Progress

## Phase 1: Core (web UI + manual input)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Monorepo scaffold | ✅ Done | Turborepo + pnpm, Hono API + Next.js Web + shared package, Biome + Vitest |
| 2 | PostgreSQL + Drizzle ORM schema | ✅ Done | Docker scripts, Drizzle schema (users/events/event_logs), drizzle-kit config |
| 3 | Better Auth setup | ✅ Done | Email+password, session cookies, admin role, first-user-admin hook |
| 4 | CRUD events API | ✅ Done | 5 REST endpoints, shared Zod schemas, visibility rules, change logging (103 tests) |
| 5 | Users list endpoint | Not started | `GET /api/users` → `[{ id, name, color }]` for member filter sidebar |
| 6 | Frontend setup | Not started | Tailwind CSS + shadcn/ui, auth pages (`/login`, `/register`), session management |
| 7 | Calendar month view | Not started | Month grid, color-coded event pills, member filter sidebar, prev/next navigation |
| 8 | Event create/edit/delete | Not started | shadcn modal dialog for create/edit form, delete with confirmation |
| 9 | Event change log UI | Not started | History section in event detail showing who changed what |
| 10 | LAN deploy | Not started | Bind to 0.0.0.0, family access via local network |

## Phase 2: Enhancements (future)

| # | Task | Notes |
|---|------|-------|
| 11 | Week view | Hourly time-slot grid, toggle between month/week |
| 12 | Admin UI | User management page (list/ban/remove users) — Better Auth admin plugin APIs already exist |
| 13 | Smart input | LLM-powered input via llm-gateway (image/voice/text → structured events) |
| 14 | Notifications | Reminders and alerts for upcoming events |
| 15 | Mobile app | Swift iOS app calling same Hono API (Better Auth bearer token) |

## What's Working

- Monorepo: `apps/api` (Hono, port 3001), `apps/web` (Next.js, port 3000), `packages/shared`
- `pnpm dev` / `pnpm lint` / `pnpm test` across all packages (103 tests passing)
- Docker PostgreSQL: `scripts/db-start.sh` / `db-stop.sh` / `db-reset.sh`
- Auth: signup, signin, signout, session check, admin plugin, `requireAuth` middleware
- Events CRUD: 5 endpoints with visibility rules, Zod validation, change logging, date range filtering

## What's Next

Task 5: Users list endpoint — small backend addition before starting frontend work.

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, frontend decisions, build phases
