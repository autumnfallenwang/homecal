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

## Phase 3: LAN + iOS App ✅

| # | Task | Status | Notes |
|---|------|--------|-------|
| 13 | LAN expose | ✅ Done | API accessible from LAN at 192.168.1.163:3001, web frontend proxies to Arch backend via env config |
| 14 | Better Auth bearer tokens | ✅ Done | Bearer plugin, configurable CORS/trusted origins via `CORS_ORIGINS` env var, integration tests |
| 15 | iOS project setup | ✅ Done | Swift package (SPM), APIClient actor with all endpoints, data models, health check UI, SwiftLint + test target |
| 16 | iOS auth | ✅ Done | LoginView + RegisterView (with ColorPicker), KeychainService, AuthManager (@Observable), HomeView placeholder, 5 Swift tests |
| 17 | iOS calendar views | ✅ Done | Month grid + week grid in SwiftUI, CalendarViewModel, event pills, member filter, overlap handling, 7 Swift tests |
| 18 | iOS event CRUD | ✅ Done | EventFormView (create+edit+delete sheets), change log with field diffs, auto-scroll week to 7AM, URL fix for query params |
| 19 | iOS smart input (text) | ✅ Done | Smart input text field with sparkles button, calls parse API, pre-fills EventFormView with local-time-aware ISO parsing |
| 20 | iOS day view | ✅ Done | DayGridView with 24h scrollable grid, month day-tap navigates to day view, day mode in segmented picker, reuses WeekEventBlockView |

## Phase 4: Event Assignees

| # | Task | Status | Notes |
|---|------|--------|-------|
| 21 | Assignees schema + migration | ✅ Done | `event_assignees` join table (id, eventId, userId), unique constraint, cascade deletes, backfill migration (owner → assignee), 10 new tests |
| 22 | Assignees API | ✅ Done | Zod schemas + all CRUD endpoints return assignees array, assignee change logging, 7 new integration tests |
| 23 | Assignees web UI | ✅ Done | Multi-select assignee picker in EventDialog, filter by assignee (not owner), event pills colored by first assignee |
| 24 | Assignees iOS UI | ✅ Done | Multi-select assignee picker in EventFormView, filter by assignee, event pills colored by first assignee |

## Phase 5: Reminders + iOS Push Notifications

| # | Task | Status | Notes |
|---|------|--------|-------|
| 25 | Reminders schema + API | ✅ Done | `event_reminders` + `device_tokens` tables, reminder CRUD nested under events, device registration/upsert/unregister, events API returns reminders, 12 unit + 19 integration tests |
| 26 | Reminder scheduler + APNs | ✅ Done | setInterval cron (60s), due-reminder SQL query, APNs HTTP/2 JWT client, push dispatch to assignees' iOS devices, `sentAt` tracking, stale token cleanup, 6 unit + 5 integration tests (mock APNs) |
| 27 | iOS reminder UI | ✅ Done | Reminder preset toggles (15min/1hr/1day) in EventFormView, immediate API add/remove, pending reminders for new events, push notification permission request + AppDelegate device token registration |
| 28 | Email notification backend | ✅ Done | Nodemailer + Gmail SMTP, `channel` column ("email"/"push") on event_reminders, scheduler dispatches by channel, email service with graceful skip, 4 unit + 6 integration tests |
| 29 | Web reminder UI | ✅ Done | Email reminder preset buttons (15min/1hr/1day) in EventDialog, immediate API toggle for existing events, queued creation for new events, pre-populated on edit |
| 30 | iOS reminder UI update | Not started | Add email channel option to reminder picker (multi-select: email, push, or both) |

## Phase 6: Admin UI

| # | Task | Status | Notes |
|---|------|--------|-------|
| 31 | Admin web UI — basic | ✅ Done | `/admin` page with user table, delete with confirmation, admin-only access, settings icon in header |
| 32 | Admin — search + create user | ✅ Done | Search by name/email (case-insensitive), create user modal (name/email/password/color/role/status) |
| 33 | Admin — edit user modal | ✅ Done | Unified edit modal: name, email, color, password reset, role toggle (user/admin), status toggle (active/inactive), all via Better Auth admin APIs |
| 34 | Admin — reset password + sessions | ✅ Done | Password reset in edit modal (leave blank to keep current), activate/deactivate (ban/unban) in edit modal. Sessions management deferred. |

## Phase 7: Production Deployment

| # | Task | Status | Notes |
|---|------|--------|-------|
| 35 | Docker deployment setup | ✅ Done | Dockerfiles (API + Web), compose.yaml (DB + API + Web on ports 51000/51001/51432), `.env.production`, `homecal` CLI (start/stop/restart/logs/status/rebuild/migrate/deploy), all 3 containers verified running |

## Phase 8: Future Enhancements (deferred)

| # | Task | Status | Notes |
|---|------|--------|-------|
| — | iOS push via APNs | Not started | Enable when Apple Developer account is available |
| — | Web Push notifications | Not started | Service Worker + Web Push API (add if users want desktop alerts) |
| — | iOS voice input | Not started | Speech framework mic button → parse endpoint (requires physical device) |
| — | Recurring events | Not started | Repeat rules (daily/weekly/monthly) |

## What's Working

- Monorepo: `apps/api` (Hono, port 3001), `apps/web` (Next.js, port 3000), `apps/ios` (SwiftUI), `packages/shared`
- `pnpm dev` / `pnpm lint` / `pnpm test` across all packages (112 unit tests + 123 integration tests; 13 Swift tests)
- Docker PostgreSQL: `scripts/db-start.sh` / `db-stop.sh` / `db-reset.sh`
- Auth: signup, signin, signout, session check, admin plugin, bearer token plugin, `requireAuth` middleware (cookies + bearer)
- Events CRUD: 5 endpoints with visibility rules, Zod validation, change logging, date range filtering
- Users list: `GET /api/users` returns `[{ id, name, color }]` ordered by name, auth-protected
- Frontend: Tailwind v4 + shadcn/ui, login/register/home pages, auth redirect hook
- Calendar month view: 42-cell grid (Mon start), event pills colored by first assignee, member filter sidebar (filters by assignee), prev/next nav
- Calendar week view: 24-hour scrollable grid, month/week toggle, click-to-create, overlap handling, event blocks colored by first assignee
- Event create/edit/delete: unified EventDialog with inline confirmation, change log history, multi-select assignee picker, email reminder presets (15min/1hr/1day toggle buttons)
- Smart input: `POST /api/events/parse` with LLM service, CalendarHeader text input, Haiku default + Gemma fallback
- Event assignees: `event_assignees` join table with unique (eventId, userId) constraint, cascade deletes, existing events backfilled with owner as assignee; all CRUD endpoints return `assignees: [{ id, name, color }]`, create defaults owner as assignee, PATCH replaces assignees, changes logged in event history
- Reminders: `event_reminders` table (eventId, minutesBefore, channel) with unique constraint, CRUD at `/api/events/:id/reminders`, events API includes reminders with channel in responses
- Device tokens: `device_tokens` table (userId, platform, token) with upsert, `/api/devices` registration/unregistration, tokens persist beyond session expiry for push notifications
- Reminder scheduler: setInterval cron (60s) checks for due reminders, dispatches by channel (email via Nodemailer/Gmail SMTP or push via APNs), marks `sentAt` to prevent duplicates, cleans up stale device tokens on BadDeviceToken
- Email notifications: Nodemailer + Gmail SMTP (free tier 500/day), sends to assignees' email addresses, graceful skip when not configured
- APNs client: token-based JWT auth (ES256), HTTP/2 to api.push.apple.com, graceful skip when credentials not configured
- LAN setup: Arch Linux (192.168.1.163) backend, Mac Air web frontend + iOS dev
- Bearer auth: configurable CORS origins via `CORS_ORIGINS` env var
- iOS app: Swift package (SPM, iOS 18+), actor-based APIClient with all endpoints (auth, events CRUD, members, parse), data models, SwiftLint config, test target
- iOS auth: Login/Register SwiftUI screens, Keychain token persistence, @Observable AuthManager with session restore, ColorPicker for user color, auth-gated root view
- iOS calendar: Month grid (42-cell Mon-start, colored event pills, +N more overflow), week grid (24h scrollable with auto-scroll to 7AM, overlap column-stacking), day grid (24h single-day view, tap from month to drill down), CalendarViewModel with async data loading, month/week/day toggle, prev/next nav, member filter sheet
- iOS event CRUD: Unified EventFormView (create + edit + delete) as sheets, date pickers, private toggle, multi-select assignee picker, delete with confirmation alert, data reload on dismiss
- iOS assignees: CalendarEvent model includes assignees array, event pills/blocks colored by first assignee, member filter filters by assignee, create defaults current user as assignee
- iOS change log: Activity section in edit sheet with field-level diffs (title/date/visibility changes), user color dots, relative timestamps ("5m ago")
- iOS smart input: Text field with sparkles button in calendar header, calls `POST /api/events/parse`, pre-fills event form with parsed title/start/end (local-time-aware ISO parsing)
- iOS reminders: Reminder preset toggles (15min/1hr/1day before) in EventFormView, immediate API calls for existing events, pending queue for new events, push notification permission on launch, AppDelegate device token forwarding to backend
- Admin UI: `/admin` page (shield icon, admin only) with user table (color dot, name, email, role badge, status badge, created), search by name/email (case-insensitive), current user pinned first. Create modal (name/email/password/color/role/status). Edit modal (name/email/color/password reset/role toggle/status toggle). Delete with confirmation (pencil + trash icons).
- User settings: gear icon for all users opens settings modal (email, color, password), auto-reloads page on save

## What's Next

Phase 7 (Production Deployment) complete. All services running on Docker (ports 51000/51001/51432).

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, frontend decisions, build phases
