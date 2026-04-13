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

## Phase 8: Event Details

| # | Task | Status | Notes |
|---|------|--------|-------|
| 36 | Add location + description fields | ✅ Done | Two optional text columns, DB migration, Zod schemas (create/update), API includes in create/update/responses with change logging, web EventDialog inputs (location text + description textarea) |

## Phase 9: Series Events

| # | Task | Status | Notes |
|---|------|--------|-------|
| 37 | Series schema + API | ✅ Done | `seriesId` column (nullable UUID) with index, bulk update `PATCH /api/events/series/:seriesId`, bulk delete `DELETE /api/events/series/:seriesId`, create accepts seriesId, 10 new integration tests |
| 38 | Series web UI | ✅ Done | Single/Series toggle in create mode, series form (date range, time, repeat every X days/weeks/months, weekday toggles, month day picker), preview step with event count + date list + confirm, batch create with shared seriesId, ↻ repeat icon on pills/blocks |
| 39 | Series edit/delete — basic | ✅ Done | Basic bulk update for shared fields, "Delete This Event" / "Delete Entire Series" options |
| 40 | Series table + API | ✅ Done | New `series` table (10 typed columns), `events.seriesId` FKs to `series.id` with cascade delete, POST/PUT/GET endpoints, frontend batch create stores series config, 2 new schema tests |
| 41 | Series full edit UI | ✅ Done | Click series event → choice dialog ("Edit this event" / "Edit entire series"). Full series edit loads config from API, reopens series form pre-populated, preview shows regenerated events, confirm = update config + delete old + create new events |
| 42 | Series single event edit | ✅ Done | "Edit this event" in choice dialog → normal single edit form, changes only that occurrence |

## Phase 10: Web Voice Input

| # | Task | Status | Notes |
|---|------|--------|-------|
| 43 | Web voice input | ✅ Done | Mic button in CalendarHeader, Chrome Web Speech API, auto-submits transcript to LLM parse, listening indicator (pulsing mic icon), falls back gracefully on unsupported browsers |

## Phase 11: Unified Quick Add + Image Input

| # | Task | Status | Notes |
|---|------|--------|-------|
| 44 | Quick Add popover | ✅ Done | Refactored header: removed inline smart input/voice, single "+ Add" button opens shadcn Popover with text input + mic + sparkles, image upload placeholder, .ics import placeholder, "create manually" link. Auto-closes on successful parse. |
| 45 | Image input — backend + frontend | ✅ Done | `POST /api/events/parse-image` with vision LLM (Haiku + Gemma fallback), `callLlmWithImage` + `buildImageParsePrompt` in llm.ts, image upload in Quick Add popover (jpg/png/webp/heic), thumbnail preview, pre-fills EventDialog. 14 new unit tests. |

## Phase 12: iCalendar Import/Export

| # | Task | Status | Notes |
|---|------|--------|-------|
| 46 | iCalendar parser + import API | ✅ Done | `POST /api/events/import` — node-ical parser, maps VEVENT fields to events, all-day → midnight-to-midnight, CLASS:PRIVATE, batch insert with assignees + logs, RRULE events skipped for v1. 16 new unit tests. |
| 47 | Import web UI | ✅ Done | "Import .ics file" button in Quick Add popover, file picker, calls POST /api/events/import, shows imported/skipped count, auto-closes popover, refetches calendar |
| 48 | Export API + web UI | ✅ Done | `GET /api/events/export.ics` (all events) + `GET /api/events/:id/export.ics` (single event). Download button (↓) in header, Export button in EventDialog next to Delete. 9 unit tests. |

## Phase 13: Web Design Refresh — Warm Editorial

Visual redesign of `apps/web` to the Warm Editorial aesthetic (Fraunces + Inter Tight, warm paper/ink palette, terracotta accent). Direction locked via [design-refresh-proposal.md](design-refresh-proposal.md). Visual only — no data model, API, or routing changes. Ships in three browser-verifiable sub-phases.

### Phase 13a — Foundation: tokens, fonts, header, month grid

| # | Task | Status | Notes |
|---|------|--------|-------|
| 49 | Typography + color tokens | ✅ Done | `next/font/google` loads Fraunces (opsz + SOFT axes) + Inter Tight as `--font-display` / `--font-sans` on `<html>`. Rewrote `globals.css` with Warm Editorial OKLch palette (paper, ink, terracotta accent) for light + dark, preserved all shadcn token names so existing components keep working. Added `--paper-warm`, `--rule`, `--accent-soft`, `--ink-faint`, `--shadow-card` custom tokens. `tnum`/`ss01` font features + inline SVG grain overlay on body. Focus ring now accent terracotta. Next.js build + browser verify on `/login` clean |
| 50 | Header restructure | ✅ Done | New shadcn `ui/dropdown-menu.tsx` primitive wrapping `radix-ui` DropdownMenu (styled with Warm Editorial tokens + `shadow-card`). Rewrote `calendar-header.tsx` into two rows: brand row (Fraunces `homecal.` wordmark + avatar button → dropdown) and toolbar row (Fraunces title with terracotta italic comma + year tail, segmented view toggle, prev/Today/next, quick-add trigger). Title crossfade via `key={title}` + `animate-in fade-in-0 slide-in-from-left-2`. Avatar dropdown groups: identity (name/email) → Appearance submenu (Light/Dark radio) + Account settings → Export + Import (hidden file input with onIcsImport handler) → Admin (conditional) → Sign out (destructive variant). Added `onToday` prop + handler in `page.tsx` (sets month/week/day anchor to now). Appearance Light/Dark only (no System — matches existing theme provider). Theme section removed from settings modal (moved to dropdown). `Today` segment deferred to task 60 so toggle stays 3 segments for now. Browser-verified dropdown + groups render correctly at 1440px |
| 51 | Month grid polish | ✅ Done | `month-grid.tsx`: full-name Fraunces italic day-of-week headers (`Monday`/`Tuesday`/...), Sat+Sun in terracotta accent, responsive short labels on `<md`. `day-cell.tsx`: responsive heights `min-h-28 md:min-h-32 xl:min-h-40`, `bg-paper-warm` weekend tint, 50% opacity out-of-month, Fraunces date numerals `text-2xl md:text-3xl` top-left, today gets 3px terracotta `before` accent bar + italic accent numeral (no bg fill), 18ms staggered fade-in per cell (capped 760ms) via `motion-safe:animate-in` + inline `animationDelay`, `border-rule` hairlines. "+N more" text restyled to Fraunces italic. Browser-verified at 1440px |
| 52 | Event pill redesign | ✅ Done | `event-pill.tsx` rewritten: `color-mix(in oklab, ${color} 14%, var(--background))` tint fill + 2px solid left border in member color, foreground text (not washed-out color), small 3px radius, tabular `10px` muted time prefix, dotted-underline for series (replaces `↻`), 🔒 prefix for private, all-day variant is `rounded-r-full` + italic Fraunces + right-edge bleed. Hover: `translate-x-px` + 1px `ring-foreground/25`. `day-cell.tsx` computes `isAllDay` (midnight-to-midnight ≥1 day) + formats compressed time label (`7a`/`12p`/`6:30p`) and passes through. Multi-day `span-start/mid/end` deferred (needs cross-cell layout). Browser-verified at 1440px |

### Phase 13b — Week/Day views, quick-add, member filter

| # | Task | Status | Notes |
|---|------|--------|-------|
| 53 | Week/Day grid polish | Not started | Fraunces italic time gutter (compressed `6` not `6:00`), terracotta current-time line + gutter dot (pulse w/ `prefers-reduced-motion` guard), 1px inner shadow on overlapped blocks, scroll-to-now on "today" |
| 54 | Member filter redesign | Not started | `member-filter.tsx`: collapse to horizontal chip row on `<lg`, Fraunces avatar initials in member-colored circles, filled vs 1px outline states, "Only me" / "Everyone" quick toggles |
| 55 | Quick Add popover redesign | Not started | `quick-add-popover.tsx`: single large Fraunces-placeholder input, 4 circular icon buttons (type/voice/image/ics), animated 3-bar equalizer during voice capture, skeleton preview of parsed event card before dialog opens |

### Phase 13c — Event dialog, states, a11y

| # | Task | Status | Notes |
|---|------|--------|-------|
| 56 | Event dialog redesign | Not started | `event-dialog.tsx`: two-column md+ layout (title/time/location/assignees \| notes/reminders/recurrence/privacy), Fraunces 24px title input, avatar chip assignees, segmented reminder presets, sticky mobile save. Keep change-log tab |
| 57 | Loading / empty / overflow states | Not started | 42-cell shimmering grid skeleton, hover `+` affordance on empty days, inline SVG illustration + CTA on empty calendar, terracotta "+N" chip opens `EventDetailPopover` listing hidden events (no dialog hop). **Shared component**: `EventDetailPopover` is the single source of truth for event detail rows, reused by Today-view tap (task 61) |
| 58 | Accessibility + motion polish | Not started | Terracotta focus rings, `prefers-reduced-motion` guards on all stagger/pulse animations, tabular-numeral audit, 4.5:1 contrast verification across pill variants in light + dark, full browser pass month/week/day/quick-add/dialog/admin |
| 58a | Auth screens refresh | Not started | Rewrite `/login` + `/register` — warm paper + grain background, two-column on `lg+` (Fraunces hero left + form `Card` right), `Welcome home` / `Make yourself at home` italic heroes w/ inline SVG, Fraunces 18px labels, terracotta inline error states, Fraunces italic link pair at bottom, Better Auth errors via sonner toast |
| 58b | Settings modal polish + global shells | Not started | Shrink settings modal (3 sections: identity / color / password — theme toggle moved to avatar dropdown), md+ two-column layout. Add `app/loading.tsx` (global skeleton), `app/error.tsx` (Fraunces "Something tripped on the rug." + retry), `app/not-found.tsx` (Fraunces "Lost in the calendar." + compass SVG). Verify sonner picks up tokens; add `<Toaster />` override in `layout.tsx` if needed |
| 58c | Change log + misc component audit | Not started | `ChangeLog`: Fraunces italic timestamps, Inter Tight 12px uppercase diff labels, 18px avatar chip for author. Destructive `AlertDialog` contrast check (delete event, remove from family) — may need slightly darker destructive token in light. Audit shared inputs (reminder presets, private switch, location, date-time). Cross-screen walkthrough: month → week → day → today → quick-add → event dialog → settings → login → register → family → 404 → error boundary |

## Phase 14: "Today" View (Morning Paper)

New glance-first surface distinct from the editing Day view. Becomes the default landing view (`Today | Day | Week | Month`). Editorial two-column spread: Fraunces date hero, timeline left with current-time line + NOW pill, glance rail right with Next-up callout + member chips (default **Just me**, session-only). Full spec in [design-refresh-proposal.md §7](design-refresh-proposal.md). Depends on Phase 13a tokens being in place.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 59 | Today endpoint | Not started | `GET /api/events/today?tz=&userIds=` → `{ serverNow, today, tomorrow: { count, firstTitle, hasMultiDayStart } }`. IANA tz validation, reuses visibility filter, shared Zod schema. Unit tests for DST/tz edges + integration tests for userIds filter |
| 60 | Today route + layout | Not started | Add `today` to view union + 4th segment in `calendar-header.tsx` (first position), default to Today on first load, migrate localStorage. New `today-view.tsx`: Morning Paper 2-col grid (`lg:grid-cols-[3fr_2fr]`), Fraunces date hero `clamp(72px,11vw,144px)`, fetches `/api/events/today` on mount + filter change |
| 61 | Timeline component | Not started | `today-timeline.tsx`: Fraunces italic hour gutter (event-range only), event cards w/ avatar chips + tabular time, past=50% opacity, current=terracotta border + pulsing NOW pill, 1px current-time line, tap → read-only `EventDetailPopover` with Edit button → existing `EventDialog`. "Earlier today (N)" collapsed row for events >2h past |
| 62 | Glance rail | Not started | `today-glance.tsx`: "Next up" callout (Intl.RelativeTimeFormat), event count chip, member avatar chips (reuse task 54 component) w/ Only me / Everyone toggles — session-only state resets to self each visit, Tomorrow teaser row → jumps to Day view. Reserved empty section at bottom for future widgets |
| 63 | Empty state + polish | Not started | *"Nothing on the books"* Fraunces empty state + inline SVG sun, sticky compressed hero on scroll, aria-live NOW/relative-time updates, full browser verification at 1440/1024/768/390px, tz correctness check |

## Phase 15: Family Page (Admin Refresh)

Reframe `/admin` as **Family** — warm portrait grid of member cards + Radix `Sheet` detail drawer. Route stays `/admin`, still admin-gated. Drops the user table + search; adds sessions list and temp-password generator. Full spec in [design-plan.md Phase 15](design-plan.md). Depends on Phase 13a tokens.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 64 | Sessions API | Not started | `GET /api/admin/users/:id/sessions` + `DELETE .../:sessionId` + `DELETE .../sessions` (revoke all), delegates to Better Auth admin plugin, admin-only middleware, shared Zod schemas, unit + integration tests |
| 65 | Temp password generator | Not started | `POST /api/admin/users/:id/reset-password` → returns `{ password }`, 14 chars crypto-random readable alphabet (no 0/O/1/l/I), hashed via Better Auth, plaintext never logged, integration test verifies auth |
| 66 | Family page redesign | Not started | Rewrite `app/admin/page.tsx` — Fraunces "Family" hero, portrait grid (`lg:4 md:3 2 cols`), `FamilyCard` component (64px initial in colored circle, Fraunces name, status row, stats), current user pinned + "you" tag, banned = desaturated + "paused" ribbon, `InviteCard` ghost at end, card click → drawer. Remove table + search |
| 67 | Member detail drawer | Not started | `member-drawer.tsx` using Radix `Sheet` (right desktop, bottom sheet mobile). Sections: portrait header w/ inline name/color edit, password reset + clipboard toast, sessions list w/ per-row revoke + "sign out everywhere", role & status toggles w/ reason, danger zone "Remove from family" (types name to confirm). Also handles new-member mode |
| 68 | Empty, loading, mobile polish | Not started | Grid skeleton (4 shimmer cards), mobile single-column + 85vh bottom sheet, `Esc` closes drawer, `/` focuses jump input, role-gated access test, browser verification 1440/1024/768/390px |

## Phase 16: Future Enhancements (deferred)

| # | Task | Status | Notes |
|---|------|--------|-------|
| — | iOS push via APNs | Not started | Enable when Apple Developer account is available |
| — | Web Push notifications | Not started | Service Worker + Web Push API (add if users want desktop alerts) |
| — | iOS voice input | Not started | Speech framework mic button → parse endpoint (requires physical device) |
| — | Today view ambient widgets | Not started | Weather, chores/waiting-on, shopping list — fill the reserved glance-rail slot |
| — | iOS Today view | Not started | Port Morning Paper layout to SwiftUI |
| — | iOS Family page | Not started | Port portrait grid + drawer layout to SwiftUI |

## What's Working

- Monorepo: `apps/api` (Hono, port 3001), `apps/web` (Next.js, port 3000), `apps/ios` (SwiftUI), `packages/shared`
- `pnpm dev` / `pnpm lint` / `pnpm test` across all packages (151 unit tests + 123 integration tests; 13 Swift tests)
- Docker PostgreSQL: `scripts/db-start.sh` / `db-stop.sh` / `db-reset.sh`
- Auth: signup, signin, signout, session check, admin plugin, bearer token plugin, `requireAuth` middleware (cookies + bearer)
- Events CRUD: 5 endpoints with visibility rules, Zod validation, change logging, date range filtering
- Users list: `GET /api/users` returns `[{ id, name, color }]` ordered by name, auth-protected
- Frontend: Tailwind v4 + shadcn/ui, login/register/home pages, auth redirect hook
- Calendar month view: 42-cell grid (Mon start), event pills colored by first assignee, member filter sidebar (filters by assignee), prev/next nav
- Calendar week view: 24-hour scrollable grid, month/week toggle, click-to-create, overlap handling, event blocks colored by first assignee
- Event create/edit/delete: unified EventDialog with inline confirmation, change log history, multi-select assignee picker, email reminder presets (15min/1hr/1day toggle buttons)
- Smart input: `POST /api/events/parse` (text) + `POST /api/events/parse-image` (image) with LLM service, Haiku default + Gemma fallback, accessed via Quick Add popover (text, voice, image upload)
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

**Phase 13a complete** — tasks 49 (tokens), 50 (header), 51 (month grid), 52 (event pills) all done. Next: pick a direction — 13b (week/day/quick-add/member filter), 13c (dialog/states/a11y), Phase 14 (Today view), or Phase 15 (Family page). Phase 13a is the token + foundation; everything downstream inherits it.

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, frontend decisions, build phases
