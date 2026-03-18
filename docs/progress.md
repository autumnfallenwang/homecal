# HomeCal — Progress

## Phase 1: Core (web UI + manual input)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Monorepo scaffold | ✅ Done | Turborepo + pnpm, Hono API + Next.js Web + shared package, Biome + Vitest |
| 2 | PostgreSQL + Drizzle ORM schema | ✅ Done | Docker scripts, Drizzle schema (users/events/event_logs), drizzle-kit config |
| 3 | Better Auth setup | ✅ Done | Email+password, session cookies, admin role, first-user-admin hook |
| 4 | CRUD events API | ✅ Done | 5 REST endpoints, shared Zod schemas, visibility rules, change logging |
| 5 | Users list endpoint | ✅ Done | `GET /api/users` → `[{ id, name, color }]` for member filter sidebar |
| 6 | Frontend setup | ✅ Done | Tailwind v4 + shadcn/ui, login/register pages, auth redirect hook, Next.js API proxy |
| 7 | Calendar month view | ✅ Done | 6x7 month grid (Mon start), color-coded event pills, member filter sidebar, prev/next nav, day-click create dialog |
| 8 | Event create/edit/delete | ✅ Done | Unified EventDialog: create (POST), edit (PATCH), delete (DELETE) with inline confirmation |
| 9 | Event change log UI | ✅ Done | `GET /api/events/:id/logs` endpoint, ChangeLog component, History section in EventDialog |
## Phase 2: Enhancements

| # | Task | Status | Notes |
|---|------|--------|-------|
| 10 | Week view | ✅ Done | 24-hour grid (scroll default 7AM), month/week toggle, click-to-create at hour, overlap handling |
| 11 | Smart input — backend | ✅ Done | `POST /api/events/parse` — text → LLM (llm-gateway) → `{ title, start, end }`, shared schemas, unit + integration tests |
| 12 | Smart input — frontend | ✅ Done | CalendarHeader smart input field, EventDialog parsedEvent pre-fill, Haiku default + Gemma fallback |

## Phase 3: LAN + iOS App

| # | Task | Status | Notes |
|---|------|--------|-------|
| 13 | LAN expose | ✅ Done | API accessible from LAN at 192.168.1.163:3001, web frontend proxies to Arch backend via env config |
| 14 | Better Auth bearer tokens | ✅ Done | Bearer plugin, configurable CORS/trusted origins via `CORS_ORIGINS` env var, integration tests |
| 15 | iOS project setup | ✅ Done | Swift package (SPM), APIClient actor with all endpoints, data models, health check UI, SwiftLint + test target |
| 16 | iOS auth | ✅ Done | LoginView + RegisterView (with ColorPicker), KeychainService, AuthManager (@Observable), HomeView placeholder, 5 Swift tests |
| 17 | iOS calendar views | ✅ Done | Month grid + week grid in SwiftUI, CalendarViewModel, event pills, member filter, overlap handling, 7 Swift tests |
| 18 | iOS event CRUD | Not started | Create/edit/delete events with sheets |
| 19 | iOS smart input — voice | Not started | iOS Speech framework → parse endpoint → pre-fill event |
| 20 | iOS notifications | Not started | Local reminders for upcoming events |

## Phase 4: Future Enhancements (deferred)

| # | Task | Status | Notes |
|---|------|--------|-------|
| — | Admin UI | Not started | User management page — low priority for small family use |
| — | Web notifications | Not started | Reminders and alerts for upcoming events |
| — | Cloud deploy | Not started | Docker Compose or Vercel + Fly.io |
| — | Push notifications (APNs) | Not started | Requires backend device token storage |

## What's Working

- Monorepo: `apps/api` (Hono, port 3001), `apps/web` (Next.js, port 3000), `apps/ios` (SwiftUI), `packages/shared`
- `pnpm dev` / `pnpm lint` / `pnpm test` across all packages (63 unit tests + integration tests; 13 Swift tests)
- Docker PostgreSQL: `scripts/db-start.sh` / `db-stop.sh` / `db-reset.sh`
- Auth: signup, signin, signout, session check, admin plugin, bearer token plugin, `requireAuth` middleware (cookies + bearer)
- Events CRUD: 5 endpoints with visibility rules, Zod validation, change logging, date range filtering
- Users list: `GET /api/users` returns `[{ id, name, color }]` ordered by name, auth-protected
- Frontend: Tailwind v4 + shadcn/ui, login/register/home pages, auth redirect hook
- Calendar month view: 42-cell grid (Mon start), color-coded event pills, member filter sidebar, prev/next nav
- Calendar week view: 24-hour scrollable grid, month/week toggle, click-to-create, overlap handling
- Event create/edit/delete: unified EventDialog with inline confirmation, change log history
- Smart input: `POST /api/events/parse` with LLM service, CalendarHeader text input, Haiku default + Gemma fallback
- LAN setup: Arch Linux (192.168.1.163) backend, Mac Air web frontend + iOS dev
- Bearer auth: configurable CORS origins via `CORS_ORIGINS` env var
- iOS app: Swift package (SPM, iOS 18+), actor-based APIClient with all endpoints (auth, events CRUD, members, parse), data models, SwiftLint config, test target
- iOS auth: Login/Register SwiftUI screens, Keychain token persistence, @Observable AuthManager with session restore, ColorPicker for user color, auth-gated root view
- iOS calendar: Month grid (42-cell Mon-start, colored event pills, +N more overflow), week grid (24h scrollable, overlap column-stacking), CalendarViewModel with async data loading, month/week toggle, prev/next nav, member filter sheet

## What's Next

Task 18: iOS event CRUD — create/edit/delete events with sheets.

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, frontend decisions, build phases
