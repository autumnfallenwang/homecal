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
| 13 | LAN expose | Not started | Bind Hono API to 0.0.0.0, verify LAN access from other devices |
| 14 | Better Auth bearer tokens | Not started | Enable token-based auth for mobile clients |
| 15 | iOS project setup | Not started | Swift package, Xcode project, API client targeting LAN backend |
| 16 | iOS auth | Not started | Login/register screens, bearer token storage in Keychain |
| 17 | iOS calendar views | Not started | Month + week views in SwiftUI |
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

- Monorepo: `apps/api` (Hono, port 3001), `apps/web` (Next.js, port 3000), `packages/shared`
- `pnpm dev` / `pnpm lint` / `pnpm test` across all packages (142 tests: unit + integration)
- Docker PostgreSQL: `scripts/db-start.sh` / `db-stop.sh` / `db-reset.sh`
- Auth: signup, signin, signout, session check, admin plugin, `requireAuth` middleware
- Events CRUD: 5 endpoints with visibility rules, Zod validation, change logging, date range filtering
- Users list: `GET /api/users` returns `[{ id, name, color }]` ordered by name, auth-protected
- Frontend: Tailwind v4 + shadcn/ui (Button, Input, Label, Card, Checkbox, Skeleton, Dialog, Switch), login/register/home pages
- Auth flow: register → auto-login → home; login → home; sign out → login; session-based redirects
- Next.js API proxy (`/api/*` → `localhost:3001`) avoids cross-origin cookie issues
- Calendar month view: 42-cell grid (6 rows x 7 cols, Monday start), month navigation, member filter sidebar with color dots
- Event pills: colored by owner (20% opacity bg), max 3 per cell with "+N more" overflow
- Event creation: click day cell → modal with pre-filled date, title/start/end/private fields, auto-refetch on create
- Event editing: click event pill → edit dialog pre-filled from event data, save (PATCH) updates pill, delete with inline confirmation
- Event change log: `GET /api/events/:id/logs` with user join, History section in edit dialog for shared events (colored dots, relative timestamps, field-level diffs)
- Week view: 24-hour scrollable grid (12AM–12AM, default scroll to 7AM), month/week toggle in header, click time slot → create event at that hour, overlapping events packed into columns, auto-anchors to current week on toggle
- Smart input backend: `POST /api/events/parse` with LLM service (prompt builder, response parser, gateway client), `parseEventInputSchema`/`parsedEventSchema` in shared package, env config for `LLM_GATEWAY_URL`/`LLM_MODEL`
- Smart input frontend: CalendarHeader text input with sparkles button (hidden on small screens), calls parse endpoint, pre-fills EventDialog with parsed title/start/end, Haiku default with Gemma fallback

## What's Next

Task 13: LAN expose (bind Hono API to 0.0.0.0, verify access from other LAN devices).

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, frontend decisions, build phases
