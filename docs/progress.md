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
| 53 | Week/Day grid polish | ✅ Done | New shared `time-grid-utils.ts` (extracted duplicated `positionEvents`, constants, `formatTimeRange`, + new `formatHourCompact` — Fantastical-style `12a/1/2/.../11/12p/...` with am/pm only at boundaries, `hourTop`, `dateTop`, `dateKey`). New `current-time-line.tsx` — 1px terracotta absolute line w/ gutter dot, `setInterval` 30s refresh, `motion-safe:animate-pulse` on the dot. `week-event-block.tsx` rewrite: `color-mix` 16% tint + 2px colored left border + foreground text + `inset 0 0 0 1px rgb(0 0 0 / 0.06)` stack shadow, tabular time label, dotted-underline series. `week-grid.tsx` + `day-grid.tsx`: Fraunces italic day-name header + Fraunces numeral (italic accent on today), warm `bg-paper-warm/40` today tint, italic compact gutter labels, `border-rule/60` hour lines, `<CurrentTimeLine>` in today's column, scroll-to-now auto-centers current time at 1/3 of viewport when today is visible (else 7am fallback). Browser-verified month/week/day at 1440×900 |
| 54 | Member filter redesign | ✅ Done | `member-filter.tsx` rewritten with `MemberChip` subcomponent — 28px avatar in Fraunces initial, filled member color when checked / 1px ring + 45% opacity when unchecked, name in Inter Tight. Fraunces italic "Family" heading + "Only me · Everyone" quick toggles in header. `flex-wrap` horizontal row on `<lg`, `lg:flex-col` vertical stack on desktop. `page.tsx`: removed `hidden lg:block`, sidebar now responsive (`border-b lg:w-60 lg:border-r`) — visible on all breakpoints. Added `handleOnlyMe` (sets to current user id) + `handleEveryone` handlers. Browser-verified at 1440 (vertical sidebar) and 390 (horizontal chip row) |
| 55 | Quick Add popover redesign | ✅ Done | `quick-add-popover.tsx` rewritten: large borderless text input with Fraunces italic "What's happening?" placeholder, 3 circular `ModeButton`s (Mic/Camera/FileText) + "Parse" submit with Sparkles, `ParsingSkeleton` replaces input zone while smart/image parser is running (title + meta + chip rows). `Equalizer` subcomponent with 3 scaled bars animated via new `eq-bar-a/b/c` keyframes in `globals.css` (wrapped in `prefers-reduced-motion: no-preference`). New "+ New event" trigger button is a rounded-full terracotta pill. Replaced `autoFocus` attribute with `useEffect`+ref focus pattern to satisfy biome a11y lint. "Or create manually →" bottom link in Fraunces italic. Browser-verified at 1440×900 |

### Phase 13c — Event dialog, states, a11y

| # | Task | Status | Notes |
|---|------|--------|-------|
| 56 | Event dialog redesign | ✅ Done | Extracted shared `MemberChip` → `components/calendar/member-chip.tsx` (size: sm \| md), refactored `MemberFilter` to reuse it. `event-dialog.tsx` JSX rewrite keeping all business logic: `DialogContent max-w-2xl max-h-[90vh] overflow-y-auto`, Fraunces italic-comma dialog title, hero Fraunces 2xl title input with bottom-border-only style + terracotta focus. Two-column `md:grid-cols-2` layout for single events (left: Location + Start/End; right: Notes + Private switch + assignee MemberChips + email reminder pills), single column for series mode. Mode toggles (Single/Series, This event/Entire series) now rounded-full segmented controls. Weekday selector uses rounded-full pill buttons. Sticky `DialogFooter` with `backdrop-blur`, `rounded-full` save button. History section in Fraunces italic. Browser-verified edit dialog at 1440×900 |
| 57 | Loading / empty / overflow states | ✅ Done | New shared `event-detail-popover.tsx` (wraps shadcn Popover; shows time + assignee avatars + title + location + member chips; reused in task 61). New `month-grid-skeleton.tsx` mirrors the real 42-cell grid with `motion-safe:animate-pulse` shimmer cells + proper day headers + weekend tint (uses `<output>` element for a11y-correct live region). New `empty-calendar.tsx` with inline SVG hand-drawn sun (12 rays + smile arc) + Fraunces "Nothing on the books." headline + italic subline + "Add your first event" CTA. `day-cell.tsx`: empty days show faint centered `+` on `group-hover`, "+N more" text replaced with an `EventDetailPopover` trigger pill listing the hidden events with a date-formatted heading. `page.tsx` destructures `isLoading` from `useEvents`, shows skeleton when loading with no data, shows empty-calendar when month view has no events. Browser-verified at 1440×900 (empty July month shows illustration + CTA) |
| 58 | Accessibility + motion polish | ✅ Done | Wrapped remaining `animate-in`/`animate-pulse` in `motion-safe:` — `calendar-header.tsx` title crossfade, `quick-add-popover.tsx` ParsingSkeleton, `change-log.tsx` skeleton, and `ui/skeleton.tsx` base (also switched from `bg-accent` → `bg-muted` so shimmer doesn't flash terracotta). Focus rings already terracotta via `--ring` token. Tabular numerals global via `html { font-feature-settings: "tnum","ss01" }` from task 49. Browser-verified month/week/dialog in light + dark mode (walnut bg, cream fg, brightened terracotta accent — all legible) |
| 58a | Auth screens refresh | ✅ Done | Rewrote `/login` + `/register` page files: `grid-cols-1 lg:grid-cols-[1.1fr_1fr]` layout, hero column (wordmark top, giant Fraunces italic headline "Welcome home," / "Make yourself at home," with terracotta comma, Fraunces italic subline, signature line at bottom) hidden on `<lg` with fallback mobile wordmark. Form column has `bg-card`, Fraunces italic labels matching event dialog, inline terracotta error block, rounded-full submit. "New here? Create an account" / "Already have a family? Sign in" links use Fraunces italic text with terracotta-underlined inline anchor. Business logic (Better Auth signIn/signUp, redirect, error handling) untouched. Browser-verified both pages at 1440×900 |
| 58b | Settings modal polish + global shells | ✅ Done | Settings modal (in `calendar-header.tsx`) now has `max-w-xl` + `md:grid-cols-2` layout: left col = Email + New password, right col = colored-swatch color picker card. Fraunces italic labels, terracotta italic-comma title, rounded-full Save changes button. New `app/loading.tsx` (wordmark + pulsing dots + "one moment…" in Fraunces italic, wrapped in `<output>` for a11y). New `app/error.tsx` client component ("Something tripped on the rug." + details `<details>` block with error.message and digest + "Try again" reset button). New `app/not-found.tsx` ("Lost in the calendar." + inline SVG compass with NE needle + "Back to today →" terracotta pill link). Sonner not installed — skipped that sub-item. Browser-verified 404 at 1440×900 |
| 58c | Change log + misc component audit | ✅ Done | `ChangeLog` rewritten: Fraunces italic timestamps right-aligned, Inter Tight uppercase-wide action label, colored author dot with subtle color-mix ring, Fraunces italic empty state, terracotta bullet for diff rows, tighter truncation. `AlertDialog` not used anywhere — destructive confirms are inline in the event dialog footer (already styled in task 56). Shared inputs (reminder pills, private switch, location/date-time) already inherit the new tokens correctly. Browser-verified edit dialog at 1440×900 shows the updated ChangeLog styling |

## Phase 14: "Today" View (Morning Paper)

New glance-first surface distinct from the editing Day view. Becomes the default landing view (`Today | Day | Week | Month`). Editorial two-column spread: Fraunces date hero, timeline left with current-time line + NOW pill, glance rail right with Next-up callout + member chips (default **Just me**, session-only). Full spec in [design-refresh-proposal.md §7](design-refresh-proposal.md). Depends on Phase 13a tokens being in place.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 59 | Today endpoint | ✅ Done | New `packages/shared` `todayQuerySchema` (tz regex + optional comma-separated userIds). New `apps/api/src/services/today.ts` with `getLocalParts`, `zonedMidnightToUtc`, `computeLocalDayWindows`, `eventOverlapsWindow` — DST-correct (offset computed at target date, not now). New route `GET /api/events/today` fetches once for `[todayStart, tomorrowEnd)`, partitions into today + tomorrow, applies visibility + assignee userIds filter, returns `{ serverNow, today, tomorrow: { count, firstTitle, hasMultiDayStart } }`. Tests: 26 unit (schema + timezone helpers incl. DST spring/fall, Shanghai, Kiritimati) + 10 integration (auth, 400 errors, visibility, userIds filter, multi-day flag, empty response). All 36 pass. Pre-existing ics-parser TS errors + series integration failures documented in `lessons.md` (unrelated to this task) |
| 60 | Today route + layout | ✅ Done | New `hooks/use-today.ts` fetches `/api/events/today` with browser IANA tz + optional userIds, auto-refreshes every 60s. New `today-view.tsx` with Morning Paper layout: Fraunces hero (weekday + `clamp(3.75rem,9vw,8rem)` date + italic terracotta comma + subline), 2-col grid `lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`, left timeline = sorted `EventRow` list (polished in task 61), right glance rail = Next up card + count chip + Tomorrow teaser + member chips (expanded in task 62). Session-scoped visibleIds initialized to `[currentUserId]` (default Just me). `page.tsx`: `view` union extended to `today`, localStorage persistence (`homecal:view`), default to `today` on first load, `view==="today"` short-circuits useEvents fetch, TodayView rendered in main when active, `from`/`to` return "" for today view. `calendar-header.tsx`: `today` in union, 4th segment at first position, prev/next/Today button row hidden on today view, title shows "Today" when active. Browser-verified at 1440×900 (Sunday April 12 hero + empty timeline + glance rail with count + Only me default) |
| 61 | Timeline component | ✅ Done | New `today-timeline.tsx` with state-aware `EventCard` (past=50% opacity, current=2px terracotta inset border + pulsing NOW pill badge top-right, future=2px assignee-colored left border) + avatar chip row + tabular time range + location. `NowLine` subcomponent draws a 1px terracotta line with time label + pulsing gutter dot. Partition helper splits events into `earlier` (ended >2h before serverNow, collapsed behind a ChevronRight "Earlier today (N)" row with rotate animation on expand) + `recent`, then inserts `<NowLine>` before the first non-past recent event. Direct `onEventClick` → existing EventDialog (skipping redundant read-only popover hop per task spec simplification). `today-view.tsx` swapped from inline `EventRow` to `<TodayTimeline>`. Browser-verified: 4 seeded events across past/recent-past/current/future states render correctly, Earlier today expand/collapse works, NOW line appears between past and current, NOW pill pulses on the current event |
| 62 | Glance rail | ✅ Done | New `today-glance.tsx`: Next up card w/ Intl.RelativeTimeFormat relative time ("starting now" / "in 42 minutes" / "in 2 hours" / "in N days"), 2px terracotta left border. Today at a glance count (`N events · M for you` when current user has a subset). Showing panel reuses shared `MemberChip` (sm size) + "Only me · Everyone" quick-toggle pair in the header. Tomorrow teaser button → `onJumpToTomorrow()` which sets dayAnchor to tomorrow + switches to Day view. Reserved empty section marked with comment for future Phase 16 widgets. `today-view.tsx` lifts member toggle handlers + delegates to `<TodayGlance>` instead of inline JSX, still falls back to a 2-card shimmer skeleton when data isn't loaded. `page.tsx` adds `handleJumpToTomorrow` and passes to TodayView. Browser-verified at 1440×900 with 4 today events + 1 multi-day tomorrow event — all rail sections render correctly |
| 63 | Empty state + polish | ✅ Done | Empty state in `today-view.tsx` enhanced: new inline `SunIllustration` (small 12-ray sun), Fraunces italic "Nothing on the books." + terracotta period + italic subline + rounded terracotta "Add your first event" pill. Scroll-driven compressed hero: `scrollRef` + `useEffect` scroll listener flips `scrolled` state at 80px, header becomes `sticky top-0` with `bg-background/85 backdrop-blur` + shrinks from `clamp(3.75rem,9vw,8rem)` to `1.75rem`, hides subline + weekday label (mobile) while scrolled. Added `aria-live="polite"` to NOW pill in `today-timeline.tsx` and to the Next up card in `today-glance.tsx` so screen readers are notified of time updates. Browser-verified at 1440 (desktop two-column + empty state + sun) and 390 (mobile stacked, sticky filter) |

## Phase 15: Family Page (Admin Refresh)

Reframe `/admin` as **Family** — warm portrait grid of member cards + Radix `Sheet` detail drawer. Route stays `/admin`, still admin-gated. Drops the user table + search; adds sessions list and temp-password generator. Full spec in [design-plan.md Phase 15](design-plan.md). Depends on Phase 13a tokens.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 64 | Sessions API | ✅ Done | New `middleware/require-admin.ts` rejects non-admin users with 403. New `routes/admin.ts` Hono app with `requireAuth` + `requireAdmin` chain: `GET /users/:id/sessions` returns shaped rows `{ id, device, ip, lastActive, expiresAt, current }` (device parsed from userAgent parens), `DELETE /users/:id/sessions/:sessionId` revokes one (404 if mismatch), `DELETE /users/:id/sessions` revokes all. Direct Drizzle queries against the `sessions` table (no Better Auth plugin indirection). Wired in `app.ts` as `/api/admin`. 10 integration tests pass (401, 403, 404, shaped list, current flag, revoke-one, revoke-all). Pre-existing 181 unit tests still pass |
| 65 | Temp password generator | ✅ Done | New `services/temp-password.ts` generates 14-char passwords from a 56-char readable alphabet (no 0/O/1/l/I) via `randomBytes` rejection-sampling for uniform distribution. New `POST /api/admin/users/:id/reset-password` in `routes/admin.ts` calls Better Auth's `auth.api.setUserPassword()` and returns plaintext once. 6 unit tests (length, alphabet, forbidden chars, uniqueness, throws) + 4 integration tests (401, 403, 404, reset + old-password-fails + new-password-signs-in). Pre-existing ics-parser TS errors still the only outstanding build issue on main |
| 66 | Family page redesign | ✅ Done | New `components/admin/family-card.tsx` — portrait card, 64px Fraunces initial in member color, Fraunces 22px name + optional "you" tag, email + status row (terracotta active dot + admin badge) + Fraunces italic "joined {Mon YYYY}" stats. Banned cards desaturated to 40% with rotated 45° "paused" destructive ribbon in the top-right corner. Hover: 1px terracotta border + `translateY(-0.5px)`. New `components/admin/invite-card.tsx` — dashed ghost outline with large `+` icon + Fraunces italic "Add a family member" + subline. Rewrote `app/admin/page.tsx`: dropped the old table + create/edit modal entirely, added Fraunces "Family," hero with italic terracotta comma + `5 members · managed by {name}` subline + "Back to calendar" pill button, portrait grid `lg:grid-cols-4 md:grid-cols-3 grid-cols-2 gap-4`, skeleton while loading, InviteCard appended after members. Card click stores `selectedMember` (task 67 wires the drawer). Browser-verified at 1440×900 with 5 seeded users |
| 67 | Member detail drawer | ✅ Done | New `components/ui/sheet.tsx` shadcn primitive wrapping `radix-ui` Dialog, `side: "right" \| "bottom"` variants. New `components/admin/member-drawer.tsx` with sections: (1) portrait header with avatar + Fraunces italic-comma title, (2) Name/Email/Color inline edit (color swatch + native picker + hex), (3) Role & status switches (Admin + Active/Paused), (4) Password — "Reset password" button calls task-65 endpoint, surfaces plaintext in a terracotta-bordered box with Copy button + Check confirmation icon (no sonner dep, just inline UI), (5) Sessions — fetched from task-64 API, per-row "Sign out" + "Sign out everywhere" destructive link, (6) Danger zone — "Remove from family" with two-step confirmation that requires typing the member's name. New-member mode uses bootstrap password → immediate reset so the temp password appears inline. `app/admin/page.tsx` wires `<MemberDrawer>` with `onSaved → fetchUsers`. Browser-verified: Bob card click opens drawer, password reset surfaces monospace pw + Copy button, sessions list shows 2 entries with revoke buttons |
| 68 | Empty, loading, mobile polish | ✅ Done | `ui/sheet.tsx` `right` variant now automatically becomes a bottom sheet (85vh, rounded-top-3xl, `slide-in-from-bottom`) on `<md` and flips to a right drawer with `md:` classes on tablet+. Member drawer's `max-w-md` override dropped so the responsive sheet classes take over. Skeleton grid (4 shimmer cards) from task 66 covers loading. `Esc` close already handled by Radix. Skipped `/` jump input — unnecessary at 4–8 member family scale per design-plan rationale. Role-gated access still redirects non-admin to `/` + API 403. Browser-verified at 1440 (right drawer) + 390 (bottom sheet slides up, all sections scroll, rounded corners). Phase 15 complete |

## Ops: Pre-deploy fixes (tasks 13–15 round)

Blockers uncovered during the pre-production audit of the Phase 13–15 round. Fixed as a single pre-deploy task so prod can pick up the whole visual refresh + Today view + Family page at once.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 69 | Pre-deploy build + test fixes | ✅ Done | **`ics-parser.ts` TS build errors** (pre-existing, Phase 12): added `icsString(v)` helper that normalizes node-ical's `string \| { val: string }` shape on `summary`/`location`/`description`, plus a null guard on the keyed parsed entry. **`require-admin.ts` TS error** (Phase 15 regression): restored `async` on the middleware handler (Hono's `createMiddleware` types require it) with a biome-ignore for the `useAwait` rule. **`series.integration.test.ts` 5 failing tests** (pre-existing, Phase 9): tests were generating raw `randomUUID()` seriesIds that hit the Phase 9 task 40 `events.seriesId → series.id` FK constraint; added a `createSeries()` helper that inserts a real series row and swapped the 5 event-linking spots to use it. Non-existent-series 404 tests keep a hardcoded zero UUID. **Results**: `pnpm lint` clean, `pnpm build` clean both packages, `pnpm --filter @homecal/api test` now 25 files / 345 passing (was 24/340). Lessons note updated |

## Phase 16: Multi-app API — open HomeCal as a shared service

Prep work to let HomeCal's REST API be called safely by other "home apps". Four tasks in ordered dependency: machine-auth → rate limiting → versioning → self-documenting. Full rationale + audit in [design-plan.md Phase 16](design-plan.md).

| # | Task | Status | Notes |
|---|------|--------|-------|
| 70 | Better Auth `apiKey` plugin | ✅ Done | Enabled Better Auth's first-party `apiKey` plugin in `auth.ts` with `enableSessionForAPIKeys: true`, `apiKeyHeaders: "x-api-key"`, `defaultPrefix: "hc_"`, `requireName: true`. New `apikeys` table in Drizzle schema (plural to match `usePlural: true` adapter resolution) + migration `0008_oval_ultimates.sql`. Three new admin routes in `admin.ts`: `POST /api/admin/api-keys` (validates target user → calls `auth.api.createApiKey` **without headers** so cross-user creation works → returns plaintext once), `GET /api/admin/api-keys?userId=` (direct Drizzle select, masked rows, no `key` field), `DELETE /api/admin/api-keys/:id` (Drizzle delete with 404 guard). `requireAuth` middleware wraps `auth.api.getSession` in try/catch so APIErrors thrown by the plugin (deleted/disabled key) become 401 instead of bubbling as 500. Shared `createApiKeyInputSchema` in `packages/shared`. **11 integration tests** cover: 401 unauth, 403 non-admin, 400 invalid body, 404 unknown user, create + plaintext, x-api-key authenticates `/api/users`, admin-scoped service key passes `requireAdmin`, user-scoped fails it, masked list, userId filter, delete + 401 after, 404 unknown delete. All 26 test files / 356 tests pass |
| 71 | Rate limiting | ✅ Done | Added `hono-rate-limiter@0.5.3` dependency. New `middleware/rate-limit.ts` exports `getRateLimitKey` (api key → user id → forwarded IP → anon, exported for unit testing) and two limiters: `apiRateLimiter` (default 600/min) + `adminRateLimiter` (default 1200/min, 2× quota for the web Family page). Both use draft-7 `RateLimit-*` headers. Configurable via `RATE_LIMIT_PER_MIN` env var. Mounted in `app.ts` via a single dispatcher: `app.use("/api/*", c => /api/admin/* ? admin : api)`. Gated on `NODE_ENV !== "test"` so the in-memory store doesn't bleed across vitest workers; integration tests spin up their own mini Hono app instead. **8 unit tests** for key extraction (precedence, forwarded chain, fallbacks) + **5 integration tests** (under-limit pass, over-limit 429, draft-7 headers, key isolation, IP isolation). All 28 files / 369 tests pass |
| 72 | API versioning (`/api/v1` prefix) | ✅ Done | `app.ts` mounts every route group under both `/api/...` (legacy) and `/api/v1/...` via a `for (const prefix of apiPrefixes)` loop. New middleware on `/api/*` runs after `next()` and stamps `Deprecation: true` + `Sunset: <date>` (overridable via `LEGACY_API_SUNSET` env, default `Wed, 01 Jul 2026 00:00:00 GMT`) + `Link: </api/v1/...>; rel="successor-version"` headers, skipping `/api/v1/*`, `/api/auth/*`, and `/health`. Updated `isAdminPath` in the rate-limit dispatcher to match both `/api/admin/` and `/api/v1/admin/`. New `docs/api-versioning.md` documenting the policy (breaking → new version; additive → current; 3-month sunset window; auth routes excluded from versioning). 7 integration tests: identical bodies across both prefixes, legacy stamps headers, v1 doesn't, auth doesn't, /health doesn't, POST /api/v1/events creates a row visible from /api/events, admin endpoints work under both prefixes. All 29 files / 376 tests pass |
| 73 | OpenAPI + Swagger UI | ✅ Done | **Deviation from original plan**: instead of migrating every route from `new Hono()` to `new OpenAPIHono()` (4–6h mechanical refactor), hand-curated a single OpenAPI 3.1 spec at `apps/api/src/openapi/spec.ts` and derive `components.schemas` from existing `@homecal/shared` Zod schemas via `zod-to-json-schema` (target: `openApi3`). Added `zod-to-json-schema@3.25.2` dep. Spec covers ~30 paths across `events`, `today`, `series`, `reminders`, `users`, `devices`, `admin` tags, with three security schemes (cookieAuth, bearerAuth, apiKeyAuth) and `/api/v1` server URL. Better Auth `/api/auth/*` routes deliberately excluded. New `swagger-ui.html.ts` exports a CDN-loaded Swagger UI page (no `@hono/swagger-ui` dep). `app.ts` mounts `GET /api/openapi.json` (returns spec JSON) and `GET /api/docs` (Swagger UI HTML) before the deprecation middleware, with both excluded from the legacy header stamping. 9 integration tests verify: spec status + content-type, OpenAPI 3.1 envelope shape, all three security schemes declared, all 13 component schemas present, all major paths documented, every operation has tags + summary, no Deprecation header on meta endpoints, /api/docs returns HTML with `swagger-ui` + `/api/openapi.json` references. All 30 files / 385 tests pass |

**Explicitly deferred to later**: migrating web + iOS clients off `/api/*` onto `/api/v1/*`, OAuth delegated auth for external apps, outbound webhooks.

## Phase 17: Service Account & API Key Management UI

Phase 16 shipped the **infrastructure** for service-to-service calls. This phase ships the **management surface** so admins can create, monitor, rotate, and revoke service accounts and their keys without touching curl. Adds a "Services" tab to the existing `/admin` Family page. Mental model: HomeCal uses the GitHub PAT pattern — a service account is a normal user record with `isService=true` (password is throwaway, the API key is the credential). Full design + aesthetic decisions in [design-plan.md Phase 17](design-plan.md).

| # | Task | Status | Notes |
|---|------|--------|-------|
| 74 | Service account flag + create endpoint | ✅ Done | Migration `0009_puzzling_taskmaster.sql` adds `users.isService boolean default false`. Registered `isService` in `auth.ts` `additionalFields` so Better Auth's `createUser({ data: { isService: true } })` actually persists it. New `POST /api/admin/service-accounts` body `{ name, role?, color? }` — generates 32-byte random password via `randomBytes` (never returned), generates a synthetic `${slug}-${4-byte hex}@service.homecal.local` email, calls `auth.api.createUser` headerless. Returns `{ id, name, email, role, color, isService, createdAt }`. `GET /api/users` filtered to `WHERE isService=false` so calendar member list excludes service accounts. Shared `createServiceAccountSchema` + `CreateServiceAccountInput` type. **7 integration tests** (401, 403, 400 empty name, 400 bad color, 200 create with default role, 200 admin role + custom color, /api/users exclusion). All 32 files / 393 tests pass |
| 75 | API key list metadata + rotation | ✅ Done | `GET /api/admin/api-keys` now surfaces `requestCount` alongside existing `lastRequest`/`enabled`/`name`. New `POST /api/admin/api-keys/:id/rotate` mints a new key with the same `name` + `userId` via headerless `auth.api.createApiKey`, returns `{ ...plaintext, rotatedFromId }`, **does NOT auto-delete the old** — grace window lets the admin migrate the caller first then `DELETE` the predecessor. **5 new integration tests** (401, 403, 404, mints with same name+userId+rotatedFromId, grace-window: both keys authenticate until manual revoke) + 4 field assertions added to the existing list test. All 32 files / 398 tests pass |
| 76 | Service accounts list endpoint | ✅ Done | New `GET /api/admin/service-accounts` returns `[{ user: {id,name,role,banned,color,createdAt}, keys: [...] }]` for everyone with `isService=true`. Single roundtrip — selects users first, then batches key lookup via `inArray(apikeys.userId, ids)` and groups in a Map. Users ordered by `name asc`, keys by `createdAt desc`. Keys never include plaintext. **6 integration tests** (401, 403, empty, non-service exclusion, populated ordering + key shape, empty-keys-array case). All 32 files / 404 tests pass |
| 77 | Tab switcher + Services list page | ✅ Done | New `use-service-accounts.ts` hook (lazy — only fetches when `enabled && tab === "services"`), new `components/admin/services-grid.tsx` exporting `ServicesGrid` + `AddServiceCard`. Square cards (`aspect-square`) — visual rhythm break from family's 4/5 portraits. TerminalSquare lucide icon tinted by the service's color. Fraunces name, tailwind `font-mono tabular-nums` "N keys · last active {relative}" footer via a local `relativeFromNow` helper. Empty state renders Fraunces italic copy + AddServiceCard. Tab switcher refactors `app/admin/page.tsx` hero into Family/Services with `?tab=services` URL persistence via `router.replace` (scroll: false). Hero title + subtitle swap based on active tab. Click handler for service cards stubbed for task 78. Web build clean, 195 fast tests green |
| 78 | Service Account drawer | ✅ Done | New `components/admin/service-account-drawer.tsx` reusing `<Sheet>`. Header: TerminalSquare icon tinted by service color. Sections: Identity (name + color picker), Role & status (admin toggle, active/paused — only in edit mode), **API keys** (list with mono masked `prefix+start…`, `{requestCount} reqs · {relative last-request}`, per-row Rotate & Revoke ghost buttons, Mint button → inline name form → reveal-once card with Copy/Check + dismiss X), Danger zone (two-step name-confirm). **New-mode** `POST /api/admin/service-accounts` on Save, then stashes the returned user as a local `ServiceAccount` snapshot with `keys: []` so the drawer transitions in-place to edit mode for immediate first-key minting — no close/reopen. Edit mode uses `authClient.admin.updateUser/setRole/banUser/removeUser` for identity/role/status/delete, hits our own `/api/admin/api-keys*` for key ops. Wired into `app/admin/page.tsx` via new `selectedService` state + `refetch` from the hook. Web build clean (9.87 kB admin chunk) |
| 79 | Polish + verification | ✅ Code done | Empty state for Services tab (Fraunces italic copy + TerminalSquare SVG illustration + AddServiceCard) shipped in task 77. Shimmer skeletons (4 square cards) shipped in task 77. Inline copy/check confirmation shipped in task 78 (reveal-once card with Check state). `lessons.md` updated with the GitHub PAT mental model entry explaining why service account + api key is one credential, not two. **Remaining manual step**: browser verification at 1440/1024/768/390px for Family + Services tabs and both drawer modes — to be done by the user against the dev server (`pnpm dev`) since it can't run headlessly |

## Phase 18: National holidays (multi-country, read-only kicker)

Holidays are a read-only layer backed by the `date-holidays` npm package (pure JS, MIT, 200+ countries, zero network calls). Computed on-the-fly — no DB storage, no sync job. Multi-country from day one; public holidays only for v1 (observances deferred). Rendered as **Fraunces italic kicker lines** above the date numeral (no ribbons, no pill backgrounds), matching the Warm Editorial typographic aesthetic. Full spec + visual decisions in [design-plan.md Phase 18](design-plan.md).

| # | Task | Status | Notes |
|---|------|--------|-------|
| 80 | Holidays service + endpoint | ✅ Done | Added `date-holidays` dep. New `apps/api/src/services/holidays.ts` — `getHolidays({countries, from, to})` iterates year ranges, filters `type === "public"`, clips to window, merges same-date multi-country rows into one `{date, title: "A · B", countries: ["TW","US"], type}`. Validates country codes via cached `getCountries()` set; throws on unknown. 100-entry FIFO result cache. New route `GET /api/holidays?countries=US,TW&from=&to=` mounted under `/api/*` + `/api/v1/*`, validated via shared `holidaysQuerySchema` (regex + ISO dates). OpenAPI spec: new `holidays` tag, `/holidays` path, `Holiday` + `HolidaysQuery` schemas. **10 unit tests** (year list, observance filter, year-boundary span, clipping, multi-country merge, single-country separation, unknown country throws, from > to, isKnownCountry, sorted output) + **8 integration tests** (401, 400 missing/lowercase/unknown/malformed, 200 US, multi-country merge, `/api/` + `/api/v1` mounts). All 34 files / 422 tests pass |
| 81 | User country preference | ✅ Done | Migration `0010_absurd_human_fly.sql` adds `users.holidayCountries text[]` nullable (hand-applied due to drift). New `GET/PATCH /api/users/me/preferences` (hot path, bypasses Better Auth). GET derives a default from `Accept-Language` via new `acceptLanguageToCountry` + `localeToCountry` helpers in `@homecal/shared` — transient, not persisted until PATCH. PATCH with `[]` clears the column so GET falls back to the locale default again. Shared `userPreferencesSchema` with `z.string().regex(/^[A-Z]{2}$/)` + 20-country max. OpenAPI spec: new `/users/me/preferences` path + `UserPreferences` component schema. **14 locale unit tests** (BCP-47 parsing, script subtags, q-weighted Accept-Language, garbage input) + **9 preferences integration tests** (401, locale derive, empty fallback, persist + read-back, clear, validation). All 36 files / 445 tests pass |
| 82 | Kicker rendering in calendar views | ✅ Done | New `use-holidays.ts` hook (skips fetch on empty country list or missing range, sorts country key for stable re-fetch), new `use-preferences.ts` hook (GET on mount + PATCH helper, falls back silently so prefs failure never blocks the calendar), new `lib/holiday-utils.ts` with `holidayKey(date)` that uses local getFullYear/Month/Date (NOT toISOString — would TZ-shift), new `components/calendar/holiday-kicker.tsx` presentational (Fraunces italic lowercase, terracotta `·` prefix, `month` + `header` size variants). Wired into `day-cell` (absolute `pointer-events-none` kicker above the numeral so it doesn't eat click or pill budget), `week-grid` + `day-grid` headers (inline below the day name). `page.tsx` threads `usePreferences → useHolidays → {MonthGrid, WeekGrid, DayGrid}.holidays`. Also fixed an unrelated admin type-inference regression by refactoring the `.filter().map()` chain to an explicit for-loop. Kicker click → popover wiring deferred to task 83. Web build clean (10.5 kB admin / 42.1 kB home) |
| 83 | Today view holiday line + settings UI | ✅ Done | Backend: new `GET /api/holidays/countries` + `listCountries()` service helper (sorted by name, cached for process lifetime) + OpenAPI path. Frontend: new `use-countries.ts` hook with module-level cache + in-flight dedup so the settings modal doesn't re-fetch 200 entries on every open. `page.tsx` computes a separate `holidayRange` for today view (today→today) so the kicker fires without a second endpoint call. `today-view.tsx` renders an italic `·  memorial day — observed in us` kicker between the weekday label and the massive date hero, hidden when scrolled. `calendar-header` settings modal gains a **Holidays** section: Fraunces italic label, country chips with per-chip `×` remove, `+ add country` popover with search-filter + scrollable list (top 50 matches). "Show observances too" checkbox wired to a disabled no-op per spec. Save path calls `setHolidayCountries` from `usePreferences`. Web build clean (43 kB home). Full API suite 36 files / 445 tests pass |

## Phase 19: k3s migration (web + API + DB, iOS deferred) ✅

Cutover completed 2026-05-27. HomeCal moved off the single-host docker-compose stack onto the home k3s cluster managed by `arch-infra` (Argo CD GitOps), following the playbook validated on llmgw (2026-05) and homenews (Phase 17). All 4 users, 124 events, 353 assignees, 266 change-logs, 142 reminders, 9 sessions, 4 accounts migrated cleanly via `pg_dump -Fc` / `pg_restore` (exact row-count match across all 11 tables). Full design + rationale + risks in [phase19-k3s-migration-memo.md](phase19-k3s-migration-memo.md); cutover commands in [k3s-migration-runbook.md](k3s-migration-runbook.md).

**Three real bugs caught + fixed during cutover** (commits in homecal history):
1. `LLM_GATEWAY_URL=http://localhost:51277` was dead since llmgw moved to k3s — Smart Input silently broken pre-cutover. Fixed by pointing dev/prod at `llmgw.arch.local` (dev) / `llmgw.llmgw` (cluster).
2. Next.js bakes the `/api/*` rewrite at **build time**, not runtime — so runtime API_URL is ignored. Fix: pass API_URL as a docker `--build-arg` so the cluster Service DNS is baked in.
3. Better Auth set the session cookie scoped to `homecal-api.arch.local` only; calendar fetches (relative) hit `homecal.arch.local`, no cookie sent. Fix: `advanced.crossSubDomainCookies.domain=".arch.local"`.

### Phase A — Code touchups + logging hygiene + drizzle hygiene

| # | Task | Status | Notes |
|---|------|--------|-------|
| 84 | A1: env-var surface audit | ✅ Done | Authoritative env spec produced; informed B5/B6 wiring |
| 85 | A2: web SSR vs browser API URL split | ✅ Done | `next.config.ts` prefers runtime `API_URL` → falls back to `NEXT_PUBLIC_API_URL`. Important: Next.js evaluates the rewrite at BUILD time, so `API_URL` must also be passed as a docker build-arg (caught during cutover, fix in commit `e918fdf`) |
| 86 | A3: pino structured logger | ✅ Done | `apps/api/src/lib/logger.ts` — strip `@homecal/` scope → `service="homecal-api"`. Verified end-to-end in Loki (243 lines/30min, queryable by event/level/path/latency_ms) |
| 87 | A4: request-log middleware | ✅ Done | Hono middleware in `apps/api/src/middleware/request-log.ts` emits `{method, path, status, latency_ms, req_id}` per request, mounted after CORS and before rate-limit so 429s also get structured-logged |
| 88 | A5: replace 7 console.* sites with log.* | ✅ Done | index.ts startup + 6 reminder-scheduler sites; added success-path dispatch logs that were previously silent |
| 89 | A6: LOG_LEVEL env plumbed through chart | ✅ Done | Logger reads LOG_LEVEL from env; chart's api.env wires it (default `info`). Bumpable at runtime via `kubectl set env deploy/homecal-api LOG_LEVEL=debug` |
| 90 | A7: schema drift audit (blocking) | ✅ Done | Confirmed all 11 migration files (0000-0010) reproduce the running schema exactly. No baseline migration needed — relieves G7 of any drift complexity |
| 91 | A8: switch dev to drizzle-kit migrate | ✅ Done | `deploy/homecal update` switched from `push` to `migrate`; `scripts/db-reset.sh` rewritten to wipe volume + apply migrations; design-plan + CLAUDE.md updated to forbid push |
| 92 | A9: fix broken LLM_GATEWAY_URL in env templates | ✅ Done | `deploy/.env.production.example` updated to `http://llmgw.arch.local` |

### Phase B — Helm chart at `deploy/chart/`

| # | Task | Status | Notes |
|---|------|--------|-------|
| 93 | B1: scaffold Chart.yaml, _helpers.tpl, NOTES.txt | ✅ Done | Mirrors homenews's helper structure (component-scoped dict pattern) |
| 94 | B2: db StatefulSet + headless Service + PVC | ✅ Done | postgres:17-alpine, 5Gi PVC, headless Service, fsGroup 999. POSTGRES_PASSWORD via secretKeyRef. securityContext correctly split pod- vs container-level |
| 95 | B3: api Deployment + Service + Ingress | ✅ Done | Recreate (reminder-scheduler singleton), 1 replica, /health probes |
| 96 | B4: web Deployment + Service + Ingress | ✅ Done | RollingUpdate, GET / probe |
| 97 | B5: secrets via secretKeyRef | ✅ Done | DATABASE_URL, BETTER_AUTH_SECRET, EMAIL_FROM (added post-cutover after the empty-EMAIL_FROM bug surfaced), EMAIL_PASSWORD, APNS_PRIVATE_KEY. Last two are `optional: true` so missing keys don't block pod startup |
| 98 | B6: values.yaml | ✅ Done | Three blocks (api/web/db) + LLM_GATEWAY_URL=http://llmgw.llmgw + BETTER_AUTH_URL=http://homecal-api.arch.local + CORS_ORIGINS=http://homecal.arch.local |
| 99 | B7: Helm pre-install migrate Job | ✅ Done | Drizzle-kit migrate hook; chart-level `migrate.enabled` (false on initial cutover; flip to true after G7 to enable for future schema changes) |

### Phase C — Dockerfile hardening

| # | Task | Status | Notes |
|---|------|--------|-------|
| 100 | C1: Dockerfile.api — add USER node | ✅ Done | UID 1000, chown -R /app, drizzle/ migrations included |
| 101 | C2: Dockerfile.web — add USER node | ✅ Done | --chown on COPY, two build-args (NEXT_PUBLIC_* for browser bundle) + API_URL build-arg (cluster Service DNS for SSR rewrite, added in `e918fdf` after the rewrite-baked-at-build-time bug surfaced) |

### Phase D — CI/CD

| # | Task | Status | Notes |
|---|------|--------|-------|
| 102 | D1: .github/workflows/build.yml | ✅ Done | Three jobs: test → matrix build [api,web] → bump-arch-infra. Uses `git clone https://x-access-token:${GH_TOKEN}@...` URL form + `yq` (not `sed`). Concurrency group serializes main pushes. Cache scopes per matrix shard |
| 103 | D2: User-action — GitHub repo setup | ✅ Done | Reused existing `arch-infa-bump` PAT; set ARCH_INFRA_TOKEN via `gh secret set`. Both GHCR packages flipped to public after first build |
| 104 | D3: .github/dependabot.yml | ✅ Done | npm groups (hono, better-auth, drizzle, next, pino) + docker + github-actions, weekly |

### Phase E — arch-infra registration

| # | Task | Status | Notes |
|---|------|--------|-------|
| 105 | E1: apps/homecal.yaml in arch-infra | ✅ Done | Committed to arch-infra at `af2dcf1` AFTER D2 (first build green + GHCR public). `migrate.enabled=false` for initial cutover; flip to true once stable |

### Phase F — Secrets in cluster

| # | Task | Status | Notes |
|---|------|--------|-------|
| 106 | F1: create homecal-secrets (out-of-band) | ✅ Done | Reused BETTER_AUTH_SECRET + EMAIL_PASSWORD + EMAIL_FROM from existing deploy/.env.production. POSTGRES_PASSWORD=homecal_prod matches source (avoids G8 ALTER USER). Helper script + template at `scripts/create-cluster-secret.sh` + `deploy/cluster-secrets.env.example` |

### Phase R — Runbook

| # | Task | Status | Notes |
|---|------|--------|-------|
| 107 | R1: docs/k3s-migration-runbook.md | ✅ Done | Full ordered procedure (pre-cutover checklist → F1/E1 → G1-G8 → H1-H8 → rollback). Also `apps/api/scripts/bootstrap-drizzle-migrations.ts` (SHA-256 hashes from journal.json into `__drizzle_migrations`) |

### Phase G — Data migration

| # | Task | Status | Notes |
|---|------|--------|-------|
| 108 | G1: source DB pre-flight | ✅ Done | Baseline recorded: users=4, events=124, event_assignees=353, event_logs=266, event_reminders=142, series=4, sessions=9, accounts=4 |
| 109 | G2: quiesce source | ✅ Done | `docker stop homecal-api homecal-web`; confirmed zero active writers |
| 110 | G3: final pg_dump + integrity check | ✅ Done | 60KB -Fc dump; pg_restore --list shows 61 TOC entries (all 11 tables) |
| 111 | G4: cluster DB pre-flight + clean target | ✅ Done | Cluster DB was already empty (fresh initdb); skipped drop+recreate |
| 112 | G5: pg_restore into cluster pod | ✅ Done | All schema + data + FK constraints + indexes restored |
| 113 | G6: verify row counts match source | ✅ Done | **PERFECT MATCH** across all 11 tables vs source |
| 114 | G7: bootstrap __drizzle_migrations table | ✅ Done | 11 rows inserted with SHA-256 hashes from drizzle/meta/_journal.json |
| 115 | G8: align passwords post-restore | ✅ Done | Pre-aligned during F1 (POSTGRES_PASSWORD in secret matches source); verified via direct connect (`auth_ok: 4`) |

### Phase H — Cutover

| # | Task | Status | Notes |
|---|------|--------|-------|
| 116 | H1: DNS pre-flight | ✅ Done | `127.0.0.1 homecal.arch.local homecal-api.arch.local` added to /etc/hosts (matching existing llmgw/homenews entries pointing to 127.0.0.1 — Traefik LB exposed on the cluster host) |
| 117 | H2: cluster pre-flight | ✅ Done | All 3 pods 1/1 Running, ingress responds 200, Argo CD Synced/Healthy |
| 118 | H3: stop docker-compose DB | ✅ Done | docker-compose stack fully halted; port 51432 freed |
| 119 | H4: smoke test — auth + events + holidays | ✅ Done | Aaron re-signed in (cookie domain changed), 124 events render across all months. Required the cookie-scope fix (`af96482`) + the rewrite-target fix (`e918fdf`) |
| 120 | H5: reminder pipeline (email) | ✅ Done | Test reminder fired at the exact scheduled fire-time; `reminder.dispatch.email` logged with req_id correlation; email arrived at recipient; `sent_at` stamped. Email path required B5+ revision to load EMAIL_FROM from secret (was empty in initial chart, post-cutover fix `b96f23d`) |
| 121 | H6: Loki structured-query verification | ✅ Done | 243 lines / 30 min in Loki. Queryable by `event`, `level`, `path`, `status`, `latency_ms`. `service="homecal-api"` filter works (label index hit). Verified slowest-request query returns top 5 paths |
| 122 | H7: rate limiter + 4xx logging | ✅ Done | Hammered /api/v1/users with 700 unauth requests → exact 600/100 split (600 401s under limit, 100 429s over). All 4xx structured-logged in Loki with full context |
| 123 | H8: Smart Input → llmgw connectivity | ✅ Done | api pod resolves `llmgw.llmgw` via cluster Service DNS; POST /api/v1/events/parse returns valid parsed JSON in ~1s (LLM round-trip). Cross-namespace path proven end-to-end |

### Phase I — Cleanup

| # | Task | Status | Notes |
|---|------|--------|-------|
| 124 | I1: decommission docker artifacts | ✅ Done | Removed deploy/compose.yaml + deploy/homecal CLI; removed 4 stopped containers + the `deploy_homecal-db-prod-data` volume; shred deploy/.env.production (values live in cluster Secret); moved the pg_dump from /tmp to ~/.homecal-rollback/ for the safety window. Kept deploy/Dockerfile.{api,web} (GHA build), deploy/.env.production.example, cluster-secrets.env (rotation use), deploy/cluster-secrets.env.example. CLAUDE.md "Production" section rewritten for k3s |

### Phase 21 — Daily Digest

| # | Task | Status | Notes |
|---|------|--------|-------|
| 125 | Schema + shared types + migration | ✅ Done | `digest_settings` singleton table (enabled/sendAt/timezone/lastSentOn, unique `singleton`) + `users.receivesDailyDigest` (default true); shared `updateDigestSettingsSchema`/`digestSettingsSchema`; additive migration `0011_first_war_machine.sql` |
| 126 | Extract `getTodayEvents()` | ✅ Done | Moved the today-window query out of the `/today` handler into `services/today.ts` (visibility parameterized: requester's own private events vs all-private-excluded for the digest); `/today` response unchanged, existing today tests green |
| 127 | Digest renderer + email | ✅ Done | `services/digest.ts` — pure `renderDigest`/`formatLocalTimeRange` (tz-correct, private-excluded, time · title · location · assignees); `sendDigestEmail` shares `sendMail` with reminders |
| 128 | Digest scheduler | ✅ Done | `digest-settings.ts` (getOrCreate singleton, recipients, pure `isDigestDue`) + `digest-scheduler.ts` (`dispatchDigest`/`checkDueDigest`/`startDigestScheduler`) on the 60s tick; once-per-day `lastSentOn` dedup; wired in `index.ts`. `isDigestDue` fires only in a narrow `[sendAt, sendAt+5min)` window so **enabling later in the day never retroactively sends** — only reaching the send time (or "Send test") dispatches |
| 129 | Admin config API + test-send | ✅ Done | `GET`/`PATCH /api/admin/digest` (config + recipient list) + `POST /api/admin/digest/test` (immediate dispatch); admin-gated |
| 130 | Notifications tab (web UI) | ✅ Done | Admin-page **Notifications** tab (`?tab=notifications`): `use-digest` hook + `notifications-panel.tsx` — enable `Switch`, `Input type="time"` + native timezone `<select>`, `MemberChip` recipient picker, Save (`PATCH`) + "Send test" (`POST /digest/test`) with inline accent-soft feedback. Relative-path fetch via the next.config proxy |
| 131 | Digest tests (exhaustive) | ✅ Done | `digest.test.ts` (16): render/format/`isDigestDue` incl. window semantics + "enabling late doesn't fire". `digest.integration.test.ts`: dispatch, private-exclusion, dedup, empty-day, 0-recipients test-send, recipients-only PATCH, empty-body 400, admin 401/403, `getTodayEvents` visibility, no-retroactive-send |
| 132 | HTML email template | ✅ Done | `renderDigestHtml()` in `services/digest.ts` — email-safe (tables + inline styles + hex, Georgia serif) matching the approved mockup; masthead + serif date + count pill + per-event time/title/location/colored-dot assignees; HTML-escaped, hex-only color guard. `sendMail`/`sendDigestEmail` send `html` alongside the plain-text fallback; `dispatchDigest` builds both. Unit tests (content, escaping, empty-day, color guard) pass; integration asserts html passed |
| 133 | Printable digest page | ✅ Done | "Print" button on the Notifications tab → `GET /api/admin/digest/print` (admin-gated) opens a standalone page of today's digest that auto-opens the print dialog (`@media print` hides its toolbar). Shares the email card (`renderDigestCardHtml`) + `buildTodayDigestEvents`. Verified: 200 `text/html` with today's events + `window.print()`; unit + integration (403/401 gates) tests |

## Backlog (deferred)

| Item | Notes |
|---|---|
| iOS LocalConfig.swift update post-cutover | Update iOS client to hit homecal-api.arch.local; requires LAN DNS resolution on device. Follow-up to Phase 19 |
| Sealed Secrets bootstrap | Encrypt secrets at rest in arch-infra. No-downtime swap once operator is installed cluster-wide |
| iOS push via APNs | Enable when Apple Developer account is available |
| Web Push notifications | Service Worker + Web Push API (add if users want desktop alerts) |
| iOS voice input | Speech framework mic button → parse endpoint (requires physical device) |
| Today view ambient widgets | Weather, chores/waiting-on, shopping list — fill the reserved glance-rail slot |
| iOS Today view | Port Morning Paper layout to SwiftUI |
| iOS Family page | Port portrait grid + drawer layout to SwiftUI |
| Migrate web + iOS clients off legacy `/api/*` onto `/api/v1/*` | Follow-up once Phase 16 is proven |
| Outbound webhooks | HomeCal publishes events to other home apps |
| Holidays v2 | Observances, custom holidays, per-user opt-in, school/bank types |
| Public API ergonomics | Filter params on list endpoints, resource-per-user views, bulk endpoints, typed client generation sanity check (was Phase 20 placeholder) |

## What's Working

- Monorepo: `apps/api` (Hono, port 3001), `apps/web` (Next.js, port 3000), `apps/ios` (SwiftUI), `packages/shared`
- `pnpm dev` / `pnpm lint` / `pnpm test` across all packages (472 API tests: unit + integration; 13 Swift tests)
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
- Daily digest (Phase 21, complete): admin-configured family digest email — `digest_settings` singleton config (enabled/sendAt/timezone) + per-user `receivesDailyDigest` recipients; a 60s `digest-scheduler` sends once per day at the local send time (private events excluded; each event = time · title · location · assignees); admin API `GET`/`PATCH /api/admin/digest` + `POST /digest/test`; admin **Notifications** tab (`/admin?tab=notifications`) with enable toggle, send-at + timezone, `MemberChip` recipient picker, and a "Send test" button
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

Phase 19 (k3s migration, tasks 84–124) shipped 2026-05-27. Cluster is the source of truth; docker-compose is held in rollback window through 2026-06-03 then decommissioned in I1.

**Immediate follow-ups** (none blocking; pick when convenient):
- iOS `LocalConfig.swift` → point at `homecal-api.arch.local` (currently broken since H3 stopped the LAN port the iOS app was hardcoded to)
- Add `homecal.arch.local` + `homecal-api.arch.local` to /etc/hosts on any other client devices (Mac, etc.) — needs Traefik IP `192.168.1.163`, or `127.0.0.1` if accessed from the cluster host
- Flip `migrate.enabled=true` in arch-infra's `apps/homecal.yaml` after a few days — enables the Helm pre-install hook to auto-apply future Drizzle migrations
- Optional: write a backup job for the cluster PVC (parity with the old docker volume which also had none)

**Phase 21 — Daily Digest**: **complete** (tasks 125–133) on branch `fix/dev-cookie-and-today-filter` — schema + migration, `getTodayEvents` refactor, text + **HTML** renderer, email send, the 60s digest scheduler (send-window fire semantics), the admin config API, and the admin **Notifications** tab. Also uncommitted alongside: self-service email/password fix in Account settings (`auth.ts` + `calendar-header.tsx`). **All uncommitted — next step is to commit + run the full suite.**

**Phase 20** (Public API ergonomics) is the next active backlog phase per [design-plan.md](design-plan.md).

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, frontend decisions, build phases
