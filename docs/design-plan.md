# Family Calendar — Design Plan

## Concept

A smart family calendar app running on a local home network. Each family member has an account and can view everyone's shared events in one place. Future: LLM-powered smart input (image/voice/text → structured events).

## Tech Stack

| Layer | Tech |
|-------|------|
| Monorepo | Turborepo + pnpm |
| Web Frontend | Next.js (App Router) |
| iOS App | Swift + SwiftUI |
| Backend API | Hono |
| Auth | Better Auth (email+password, session cookies for web, bearer tokens for iOS) |
| Validation | Zod (shared schemas) |
| Database | PostgreSQL (Docker) + Drizzle ORM |
| LLM | llm-gateway (OpenAI-compatible) → Claude Haiku 4.5 / Gemma 3 27B |

## Data Model

```
User            { id, name, color, passwordHash, createdAt }
Event           { id, title, location, description, start, end, ownerId, private, seriesId, createdAt, updatedAt }
Series          { id, startDate, endDate, startTime, endTime, repeatEvery, repeatUnit, weekDays, monthDay, createdAt }
EventAssignee   { id, eventId, userId }
EventReminder   { id, eventId, minutesBefore, channel, sentAt, createdAt }
EventLog        { id, eventId, userId, action, changes, timestamp }
DeviceToken     { id, userId, platform, token, createdAt }
```

### Assignees
- Every event has **assignees** — the people this event is for
- Creator (`ownerId`) is who made the event; assignees are who it's about
- Default: creator is also the sole assignee (backward compatible)
- Multi-select: "Family dinner" → assign all members; "Kid's dentist" → assign kid only
- Calendar filter: member sidebar filters by assignee (not just owner)
- Event pills show the color of the **first assignee** (or multi-dot for multiple)

### Reminders
- Each event can have **reminders** — time-based alerts before the event starts
- Stored as `minutesBefore` (e.g., 15, 60, 1440 for 15min/1hr/1day)
- Each reminder has a **channel**: `"email"` or `"push"`
- `email`: sends to assignees' email addresses via Gmail SMTP (Nodemailer) — works for all users, free tier (500/day)
- `push`: sends to assignees' iOS devices via APNs — requires Apple Developer account (future)
- Backend scheduler checks for due reminders and dispatches via the appropriate channel
- `sentAt` column tracks delivery to prevent duplicates
- Same event can have multiple reminders with different channels (e.g., email 1hr before + push 15min before)

### Series Events
- Events can be **single** (`seriesId = null`) or part of a **series** (`seriesId = shared UUID`)
- Series are created via a batch creator: date range + time + repeat pattern → generates N individual events
- Repeat patterns: every X days, every X weeks (with weekday toggles), every X months (with day picker)
- All events in a series share the same `seriesId`, title, location, description, assignees, reminders
- **`series` table**: Stores the repeat config (startDate, endDate, startTime, endTime, repeatEvery, repeatUnit, weekDays, monthDay). Events reference it via `seriesId → series.id`. Lightweight reference table — events stay self-contained, series table just stores the recipe for reconstructing the form on edit.
- **Create**: Single/Series toggle in EventDialog. Series shows date range, time, repeat pattern. Preview step shows all events before confirming.
- **Edit**: clicking a series event shows choice: "Edit this event" (normal single edit) or "Edit entire series" (reopens full series form pre-populated with seriesConfig, preview regenerated events, confirm = delete old + create new with same seriesId)
- **Delete single**: deletes just that event
- **Delete series event**: two options — "Delete This Event" (removes one) or "Delete Entire Series" (removes all via `DELETE /api/events/series/:seriesId`)
- **Visual**: series events show a repeat icon (↻) on calendar pills/blocks

### Notification Strategy
- **Web app**: email is the only notification option (no push needed for desktop browser)
- **iOS app**: can choose email, push, or both per reminder (push requires Apple Developer account)
- **Email works for everyone**: users already have email in their profile, phone shows email notifications natively

## Core Rules

- Each user has ONE calendar (their own events)
- Events default to **shared** (visible to all family members)
- User can toggle an event to **private** (only they can see/edit it)
- Shared events can be **edited/deleted by anyone**
- All changes to shared events are logged (EventLog) for transparency
- Private events are only visible to and editable by the owner
- Reminders fire for all assignees on all their devices

## Auth

- Better Auth with email+password
- Web: session cookies (via Next.js API proxy)
- iOS: bearer tokens (Better Auth bearer plugin)
- First user to register becomes admin (can invite/remove members)
- Local network — no OAuth needed

## Frontend Decisions

- **UI stack**: Tailwind CSS + shadcn/ui components + custom calendar grid
- **Calendar**: Month view first, week view deferred to Phase 2
- **Event editing**: Modal dialog (stays on calendar page)
- **Pages**: `/login`, `/register`, `/` (protected main calendar)
- **Admin**: Deferred — Better Auth admin plugin provides full API (`/api/auth/admin/*`), build UI later

## UI Overview

### Main Layout

```
┌─────────────────────────────────────────────────┐
│ Header: HomeCal logo | "Feb 2026" ◀ ▶ | + New  │
│         Month/Week toggle     [user avatar] Out │
├────────────────────┬────────────────────────────┤
│ Sidebar            │  Calendar Grid             │
│                    │                            │
│ Family Members     │  Mon  Tue  Wed  Thu  Fri   │
│ ☑ 🟢 Dad          │  ┌───┬───┬───┬───┬───┐    │
│ ☑ 🔵 Mom          │  │   │   │   │   │   │    │
│ ☑ 🟠 Kid          │  │   │ 🟢│   │🔵 │   │    │
│                    │  │   │Gym│   │Doc│   │    │
│                    │  └───┴───┴───┴───┴───┘    │
├────────────────────┴────────────────────────────┤
│ (Event modal dialog opens on click / "+ New")   │
└─────────────────────────────────────────────────┘
```

### Key Components
- **Header** — month navigation (prev/next), "New Event" button, user menu with sign out
- **MemberFilter** — sidebar checkboxes per family member (from `GET /api/users`)
- **MonthGrid** — 7-column CSS grid, events as colored pills
- **EventFormModal** — shadcn dialog for create/edit (title, start, end, private toggle)
- **AuthForm** — shared login/register form

### Event Creation
- "New Event" button → modal dialog with title, date/time, private toggle

### Event Detail
- Click an event pill → modal opens prefilled for editing
- "History" section shows change log (who changed what, when)

## Deployment

### Production (Docker)
All prod services run in Docker containers on Arch Linux desktop, managed by a single `homecal` CLI script (following the llm-gateway pattern).

| Service | Container | Port |
|---|---|---|
| PostgreSQL (prod) | `homecal-db-prod` | 51432 |
| Hono API | `homecal-api` | 51001 |
| Next.js Web | `homecal-web` | 51000 |

- **Docker Compose**: `deploy/compose.yaml` — all 3 services, `restart: unless-stopped`
- **Dockerfiles**: `deploy/Dockerfile.api` + `deploy/Dockerfile.web` — monorepo-aware builds
- **CLI**: `deploy/homecal` — start/stop/restart/logs/status/rebuild/deploy
- **Env**: `deploy/.env.production` — prod DB URL, auth secret, email creds (not committed)
- **Deploy flow**: `homecal deploy` → git pull main → build containers → run migrations → restart
- **iOS**: connects to API via LAN IP (e.g. `http://192.168.x.x:51001`)

### Development
Dev runs locally with hot reload, separate from prod.

| Service | How | Port |
|---|---|---|
| PostgreSQL (dev) | Docker container `homecal-postgres` | 5432 |
| Hono API | `pnpm dev` (tsx watch) | 3001 |
| Next.js Web | `pnpm dev` (next dev) | 3000 |

- **Branch**: feature branches, merged to `main` via PR
- **DB**: Dev database with test data, freely resettable
- **Env**: `apps/api/.env` — dev DB URL, dev secrets
- **Workflow**: code on feature branch → test → PR → merge to main → `homecal deploy` updates prod

### Dev/Prod Isolation
- **Databases**: Completely separate — dev on port 5432, prod on port 51432. Different data, same schema.
- **Migrations**: SQL files in `apps/api/drizzle/` applied via `pnpm db:migrate` (uses `drizzle-kit migrate`). Additive-only — adds tables/columns, never touches data. The legacy `drizzle-kit push` workflow was deprecated in Phase 19 — `push` doesn't track applied migrations and silently dropped users in prod historically.
- **Ports**: No conflicts — dev (3000/3001/5432) and prod (51000/51001/51432) can run simultaneously.

## iOS Development Workflow

- **Dev machine**: Arch Linux (code editing, git, backend)
- **Build machine**: Mac Air via SSH (Xcode, `xcodebuild`, simulator, device deploy)
- **Flow**: Edit on Linux → push to git → SSH into Mac → pull + build + test
- **Device install**: Xcode direct install via USB (free Apple ID = 7-day expiry, $99/yr = 1-year + TestFlight)
- **One-time Mac setup**: Install Xcode, sign in Apple ID, enable Remote Login for SSH

## Build Phases

### Phase 1 — Core (web UI + manual input) ✅
1. Scaffold monorepo (Turborepo + pnpm + Next.js + Hono)
2. PostgreSQL (Docker) + Drizzle ORM schema + migrations
3. Better Auth (register, login, session)
4. CRUD events API (Hono endpoints)
5. Users list endpoint (`GET /api/users` for member filter)
6. Frontend setup (Tailwind + shadcn/ui, auth pages, session management)
7. Calendar month view (month grid, event pills, member filter sidebar)
8. Event create/edit/delete UI (modal dialog)
9. Event change log UI

### Phase 2 — Web Enhancements ✅
10. Week view (hourly time-slot grid, month/week toggle)
11. Smart input — backend (LLM parse endpoint)
12. Smart input — frontend (natural language → pre-fill dialog)

### Phase 3 — LAN + iOS App ✅
13. LAN expose — bind Hono API to `0.0.0.0`, verify LAN access from other devices
14. Better Auth bearer token plugin — enable token-based auth for mobile clients
15. iOS project setup — Swift package, Xcode project, API client targeting LAN backend
16. iOS auth — login/register screens, bearer token storage in Keychain
17. iOS calendar views — month + week views in SwiftUI
18. iOS event CRUD — create/edit/delete events with sheets, change log with field diffs
19. iOS smart input — text field with NLP parse → pre-fill event form (testable on simulator)
20. iOS day view — tappable day detail with event list (month day-tap → day drill-down)

### Phase 4 — Event Assignees (current)
Adds the concept of "who is this event for" — separate from "who created it."
21. Assignees schema + migration — `event_assignees` join table, backfill existing events (owner = default assignee)
22. Assignees API — update create/update/get endpoints to handle assignees array, update shared Zod schemas
23. Assignees web UI — multi-select member picker in EventDialog, filter sidebar filters by assignee
24. Assignees iOS UI — multi-select member picker in EventFormView, filter by assignee

### Phase 5 — Reminders + Notifications (current)
Backend-driven reminders with email (primary) and push (future) notification channels. Email via Gmail SMTP (Nodemailer, free tier 500/day) works for all users. Push via APNs deferred until Apple Developer account available.
25. Reminders schema + API — `event_reminders` table (eventId, minutesBefore, channel, sentAt), `device_tokens` table (userId, platform, token), CRUD endpoints for reminders and device registration
26. Reminder scheduler + APNs — setInterval cron (60s), due-reminder query, APNs HTTP/2 JWT client, push dispatch, sentAt tracking, stale token cleanup
27. iOS reminder UI — reminder preset toggles (15min/1hr/1day), device token registration on app launch
28. Email notification backend — Nodemailer + Gmail SMTP service, `channel` column on `event_reminders` ("email" | "push"), scheduler dispatches email for email-channel reminders
29. Web reminder UI — reminder picker in EventDialog (email only), preset options (15min/1hr/1day before)
30. iOS reminder UI update — add email option to reminder picker (multi-select: email, push, or both)

### Phase 6 — Admin UI
Full user management for the admin (first registered user). Better Auth admin plugin provides all APIs — no custom backend needed.
31. Admin web UI — basic user table with delete, admin-only `/admin` page, settings icon in header
32. Admin — search + create user — search/filter users in table, admin creates family member accounts directly with name/email/password/color (no self-registration needed)
33. Admin — ban/unban + set role — temporarily disable accounts (with reason and optional expiry), promote/demote users to admin role
34. Admin — reset password + sessions — reset a user's password, view all active sessions per user (device/IP/last active), force logout specific devices or revoke all sessions

### Phase 7 — Production Deployment (current)
Docker-based prod deployment on Arch Linux, following the llm-gateway pattern.
35. Docker deployment setup — Dockerfiles (API + Web), compose.yaml (DB + API + Web), `.env.production`, `homecal` CLI script (start/stop/restart/logs/status/rebuild/deploy), prod ports (51000/51001/51432)

### Phase 8 — Event Details (current)
Add richer event fields beyond just title + time.
36. Add location + description fields — two optional text columns on events table, update Zod schemas (create/update), include in API responses, add inputs to web EventDialog, track changes in event log

### Phase 9 — Series Events (current)
Batch event creation with repeat patterns and series management.
37. Series schema + API — `seriesId` column (nullable UUID) on events, `PATCH /api/events/series/:seriesId` (bulk update), `DELETE /api/events/series/:seriesId` (bulk delete)
38. Series web UI — Single/Series toggle in EventDialog, series form (date range, time, repeat pattern with days/weeks/months modes), preview step with confirm, repeat icon on calendar pills
39. Series edit/delete — basic series edit (shared fields bulk update), delete options ("Delete This Event" / "Delete Entire Series")
40. Series table + API — new `series` table (id, startDate, endDate, startTime, endTime, repeatEvery, repeatUnit, weekDays, monthDay, createdAt). Update `events.seriesId` to FK → `series.id`. API: create series record alongside batch events, return series config in event responses, GET /api/series/:id endpoint.
41. Series full edit UI — clicking a series event shows "Edit this event" vs "Edit entire series" choice. "Edit this event" = normal single edit. "Edit entire series" = loads series config from API, reopens full series form pre-populated, preview regenerated events, confirm = delete old events + create new events referencing same series record (updated config).
42. Series single event edit — editing one occurrence = normal single edit, changes only that event.

### Phase 10 — Web Voice Input (current)
Voice input for the web calendar using Chrome's built-in Web Speech API. No backend changes — speech-to-text in the browser feeds into the existing LLM smart input pipeline.
43. Web voice input — mic button next to smart input sparkles button in CalendarHeader. Click → Chrome captures mic → speech-to-text via Google servers → transcript fed to `onSmartInput(text)` → LLM parse → pre-fill event form. Listening indicator while recording. Chrome/Edge only.

### Phase 11 — Unified Quick Add + Image Input
Consolidate all input methods (text, voice, image, .ics import, manual) into a single "Quick Add" popover, replacing the inline header smart input. Cleaner header, scales to new input methods, works on mobile.

**UI redesign:** Remove smart text input + sparkles + mic from header center. Header becomes: `Logo | [Month][Week][Day] | ◀ Title ▶ | [+ Add] | user ⚙ 🚪`. The "+ Add" button opens a Quick Add popover/bottom-sheet containing all input methods:
```
┌──────────────────────────────────┐
│  ✨ Type or speak to add event   │
│  ┌────────────────────────┐  🎤  │
│  │ Dentist next Tue 2pm   │      │
│  └────────────────────────┘      │
│                                  │
│  📷 Upload image / photo         │
│  📄 Import .ics file             │
│  ─────────────────────────────── │
│  ✏️  Or create manually           │
└──────────────────────────────────┘
```

44. Quick Add popover — refactor CalendarHeader: remove inline smart input/voice from header, add single "+ Add" button that opens a shadcn Popover (desktop) or Drawer (mobile). Inside: smart text input with inline mic button (reuses existing text parse + voice logic), image upload option, .ics import option, and "create manually" link that opens blank EventDialog. All paths lead to the same EventDialog pre-fill flow.
45. Image input — backend + frontend. Backend: extend `callLlm` to accept optional base64 image, send as multipart content array `[{type:"text"}, {type:"image_url"}]` to LLM gateway (OpenAI vision API format). New endpoint `POST /api/events/parse-image` accepts image upload (multipart/form-data), sends image + system prompt to vision-capable LLM, returns same parsed event JSON. Frontend: image upload area in Quick Add popover (click to browse or drag-and-drop), accepts jpg/png/heic, shows thumbnail preview, sends to parse-image endpoint, pre-fills EventDialog with result. Works for photos of handwritten notes, screenshots, flyers, etc.

### Phase 12 — iCalendar Import/Export
Import and export events using the standard iCalendar (.ics) format (RFC 5545). Enables interop with Google Calendar, Apple Calendar, Outlook, and any app that supports .ics files. No schema changes needed — .ics fields map directly to existing event columns.
46. iCalendar parser + import API — `POST /api/events/import` accepts .ics file upload, parses VEVENT blocks using `node-ical` (or `ical.js`), maps fields (SUMMARY→title, DTSTART/DTEND→start/end, LOCATION→location, DESCRIPTION→description, CLASS:PRIVATE→private), converts all timestamps to UTC, handles all-day events (DATE values → midnight-to-midnight), returns created event count. RRULE recurring events: map common patterns (daily/weekly/monthly) to series table, expand exotic patterns (BYDAY=2TU, YEARLY) into individual events. Importing user becomes owner + default assignee.
47. Import web UI — "Import" option in Quick Add popover, file picker for .ics files, preview parsed events (count + list with titles/dates) before confirming, progress indicator for large files, error summary for skipped/invalid events.
48. Export API + web UI — `GET /api/events/export.ics` returns all visible events as .ics file (with optional date range query params). `GET /api/events/:id/export.ics` exports a single event. VEVENT blocks with UID (event id), SUMMARY, DTSTART/DTEND, LOCATION, DESCRIPTION, CLASS. Download button (↓) in header for all events, Export button in EventDialog for single event.

### Phase 13 — Web Design Refresh: Warm Editorial
Visual redesign of `apps/web` to the "Warm Editorial" aesthetic — Fraunces serif display + Inter Tight body, warm paper/ink palette with terracotta accent, generous whitespace, two-tone event pills, and calmer micro-motion. Scope is visual only: no data model, API, or routing changes. Full rationale and direction live in [design-refresh-proposal.md](design-refresh-proposal.md).

**Aesthetic tokens** (locked, from Option A):
- Fonts: `Fraunces` (variable serif, display) + `Inter Tight` (body/UI), loaded via `next/font/google`, exposed as `--font-display` / `--font-sans`. Tabular numerals globally.
- Light palette: paper `oklch(0.985 0.012 85)`, warm weekend `oklch(0.965 0.018 80)`, ink `oklch(0.22 0.02 45)`, rule `oklch(0.88 0.015 70)`, accent terracotta `oklch(0.58 0.16 45)`.
- Dark palette: walnut `oklch(0.16 0.01 60)`, fg `oklch(0.94 0.01 80)`, accent brightens to `oklch(0.72 0.17 55)`.
- Event pills: 2px colored left border on a 12% tint fill via `color-mix(in oklab, var(--member) 12%, var(--paper))`, 3px radius.
- Subtle SVG grain overlay at ~5% opacity on the app background only.
- Motion: 400ms ease-out view transitions, 20–30ms staggered fade-in on month grid cells, wrapped in `@media (prefers-reduced-motion: no-preference)`.

Phase 13 ships in three sub-phases so each can be verified in the browser before moving on (per CLAUDE.md's UI verification rule).

#### Phase 13a — Foundation: tokens, fonts, header, month grid
49. Typography + color tokens — load Fraunces + Inter Tight via `next/font/google` in `app/layout.tsx`, expose as `--font-display` / `--font-sans`, set `font-feature-settings: "tnum","ss01"` globally. Rewrite `globals.css` OKLch tokens to the Warm Editorial palette (light + dark), add `--paper-warm`, `--rule`, `--accent`, `--accent-soft`, `--shadow-card`. Add grain SVG as a `<body>` background layer.
50. Header restructure (`calendar-header.tsx`) — split into two rows. Only two things stay as header buttons: the view toggle + nav, and the "+ New event" button. Everything else collapses into a single avatar dropdown.
    - **Row 1 — brand row**: wordmark `homecal.` left (terracotta period), avatar button with name + chevron right.
    - **Row 2 — toolbar**: large Fraunces month title with italic accent comma ("April,") left; segmented view toggle `[Today][Day][Week][Month]` + prev/**Today**/next nav + "+ New event" button right. Add the missing **Today** button if not present. Title crossfades + slides 8px on month change.
    - **Avatar dropdown** (shadcn `DropdownMenu`) — grouped, with dividers between each group:
      1. **Identity block** (non-interactive): `<DropdownMenuLabel>` with name (Inter Tight 14px) + email (Inter Tight 12px muted).
      2. **Preferences**: `☀ Appearance ▸` (submenu with Light / Dark / System — promoted out of the settings modal because it's the most frequently used toggle), `⚙ Account settings` (opens existing settings modal).
      3. **Data**: `⬇ Export calendar` (calls existing `/api/events/export.ics` download), `⬆ Import .ics` (opens the same file picker used by the quick-add popover — mirrored so users can find it without going through "+ Add"). Quick-add remains the *creation* surface; this menu is the *data management* surface.
      4. **Admin** (conditional, admin role only): `🛡 Admin` → `/admin`.
      5. **Sign out**: isolated at the bottom, destructive tone (use `text-destructive` variant).
    - Remove from header entirely (they all move into the dropdown): username text, export button, settings gear, admin shield, logout button.
    - Mobile (<md): brand row collapses so only the avatar button shows on the right; toolbar row wraps — title on its own line, controls below.
51. Month grid polish (`month-grid.tsx`, `day-cell.tsx`) — responsive cell height `min-h-28 md:min-h-32 xl:min-h-40`, warm-tinted weekend columns, 50% opacity (not hidden) out-of-month days, Fraunces date numerals top-left with tabular figures, today cell gets a 3px terracotta left accent bar (no background fill), italic accent-colored today numeral. Staggered fade-in (20ms) on initial mount.
52. Event pill redesign (`event-pill.tsx`) — two-tone: 12% `color-mix` tint background + 2px solid left border in assignee color. Time prefix in `tnum` at 10px, title at 11.5px. Recurring events get a dotted underline (replace ↻ glyph). Private events get a 🔒 prefix. All-day events become rounded-flag shape in Fraunces italic, bleeding to the cell edge. Multi-day spans use paired `span-start` / `span-mid` / `span-end` classes to chain across cells. Hover: 1px fg outline + 1px translateX. Verify 4.5:1 contrast in both themes.

#### Phase 13b — Week/Day views, quick-add, member filter
53. Week/Day grid polish (`week-grid.tsx`, `day-grid.tsx`) — time gutter labels in Fraunces italic, right-aligned, tabular, compressed form (`6` not `6:00`). Current-time line: 1px terracotta line across the day with a filled dot in the gutter; pulses 2s with `prefers-reduced-motion` guard. Event blocks get a 1px inner shadow so stacked overlaps read as cards. On mount for "today," scroll to current time instead of fixed 7am.
54. Member filter (`member-filter.tsx`) — on `<lg`, collapse sidebar into a horizontal chip row above the grid. Replace colored dots with avatar initials in Fraunces inside a 22–24px circle in the member's color. Checked = filled circle, unchecked = 1px outlined empty circle at 45% opacity. Add "Only me" / "Everyone" quick toggles.
55. Quick Add popover redesign (`quick-add-popover.tsx`) — lead with a single large Fraunces-placeholder input ("What's happening?"), Enter submits to the parser. Four circular icon buttons below for input mode (type/voice/image/ics) with subtle active state. Voice recording shows an animated 3-bar equalizer in place of the current `MicOff` pulse. While the parser runs, show a skeleton of the prefilled event card inside the popover before the dialog opens.

#### Phase 13c — Event dialog, empty/loading states, a11y
56. Event dialog redesign (`event-dialog.tsx`) — two-column layout on `md+` (left: title/time/location/assignees, right: notes/reminders/recurrence/privacy), single column on mobile. Title input uses Fraunces at 24px. Assignees become avatar chips (same component as member filter). Reminder presets become a segmented control. Save button is sticky to the bottom on mobile. Keep existing change-log tab.
57. Loading, empty, and overflow states — grid skeleton mirrors the real 42-cell grid with shimmering date numerals. Empty day hover shows a faint centered "+". First-run empty calendar shows a single inline SVG line-art illustration + "Add your first event" CTA. Replace the "+N more" text with a terracotta chip that opens an `EventDetailPopover` listing the hidden events with full detail (no dialog hop). **Note**: `EventDetailPopover` is an explicit shared component (`components/calendar/event-detail-popover.tsx`) used by both this "+N more" surface and the Today-view tap (task 61) — single source of truth, one place to style event detail rows.
58. Accessibility + motion polish — focus rings switch to the terracotta accent color so keyboard nav is visible on both themes; all staggered animations wrapped in `@media (prefers-reduced-motion: no-preference)`; tabular numerals audited everywhere a time/date/count appears; 4.5:1 contrast verified on every event pill variant in both light and dark modes. Browser verification across month/week/day, quick-add, dialog, and admin pages.
58a. Auth screens refresh — rewrite `app/login/page.tsx` and `app/register/page.tsx` to the Warm Editorial aesthetic. Full-bleed warm paper background with the grain overlay. Two-column layout on `lg+`: left panel is a Fraunces hero (`Welcome home` for login, `Make yourself at home` for register) italic ~72px + subline explaining what HomeCal is, with a subtle inline SVG illustration. Right panel is a centered `Card` (shadcn, `shadow-card` elevation) containing the form. Single-column stack on `<lg`. Fraunces 18px labels above Inter Tight inputs, field-level inline error states in the terracotta accent color, Fraunces italic link pair at the bottom ("New here? Create an account" / "Already have a family? Sign in"). Better Auth errors surface via sonner toast with the new token styling. Verify keyboard flow + visible focus rings end-to-end.
58b. Settings modal polish + global Next.js shells — shrink the user-settings modal now that the theme toggle has moved into the avatar dropdown (task 50): three sections only (identity with email + name, color picker, password change). Two-column layout on `md+` matching the event-dialog rhythm (task 56), single column on mobile. Fraunces 20px section headings. Add the missing App Router shells under `apps/web/src/app/`: `loading.tsx` (global page-level skeleton — Fraunces wordmark placeholder + grid skeleton), `error.tsx` (Fraunces italic "Something tripped on the rug." + retry button + small error detail in `<details>`), `not-found.tsx` (Fraunces italic "Lost in the calendar." + inline SVG compass + link home). Verify `sonner` (or current toast provider) picks up `--paper`, `--ink`, `--accent` correctly; if it doesn't, add a 2-line `<Toaster />` theme override in `layout.tsx`.
58c. Change log + misc component audit — update `ChangeLog` component (event dialog history tab) so timestamps render in Fraunces italic muted, diff field labels use Inter Tight 12px uppercase tracking, and the author dot uses the assignee color system consistently (reuse the avatar-chip component from task 54 at 18px). Pass over the destructive `AlertDialog` variants (delete event, remove from family) to ensure destructive button contrast meets 4.5:1 against the warm paper background — may need a slightly darker destructive token in light mode. Audit shared inputs used across multiple dialogs: reminder preset toggle group, private/public switch, location input, date-time pickers — all should inherit tokens cleanly but verify hover/focus/disabled states in both themes. Final cross-screen walkthrough: month → week → day → today → quick-add → event dialog → settings → login → register → family → 404 → error boundary.

**Out of scope for Phase 13:**
- `/admin` visual redesign — deferred; this phase only fixes any contrast regressions caused by the new tokens.
- iOS app — tracked separately.
- New features, backend changes, dependency additions beyond `next/font` (already available).

### Phase 14 — "Today" View (Morning Paper)
A new glance-first surface distinct from the existing editing "Day" view. Becomes the default landing view on calendar load and the fourth segment in the view toggle (`Today | Day | Week | Month`). Read-optimized: shows what's happening now, what's next, and the rest of today — with the family member filter defaulting to **Just me** every session. Full design locked in [design-refresh-proposal.md §7](design-refresh-proposal.md).

**Layout**: editorial two-column spread. Full-bleed Fraunces date hero up top. Left ~60% = vertical event timeline with past-fade, current-time line, and a NOW pill on the active event. Right ~40% = glance rail with a "Next up" callout, event counts, member chips, and a Tomorrow teaser. Events >2h past auto-collapse into an "Earlier today (N)" expandable row.

**Interactions**: tap an event → read-only detail popover with an "Edit" button that opens the existing `EventDialog` for consistency. No click-to-create on the timeline — creation stays in the header quick-add. Member chips are session-only, reset to Just me on every visit.

**Backend**: one new endpoint to avoid client-side timezone logic and keep the glance view fast.
- `GET /api/events/today?tz=...&userIds=...` → `{ serverNow, today: Event[], tomorrow: { count, firstTitle, hasMultiDayStart } }`
- Reuses existing visibility rules; no schema changes.

Depends on Phase 13a tokens (fonts, palette, shadows) being in place — Phase 14 uses the Warm Editorial system.

59. Today endpoint — `GET /api/events/today` in `apps/api/src/routes/events.ts`. Accepts `tz` (required IANA zone, validated) and optional `userIds` (comma-separated). Computes local day start/end from `tz`, reuses existing visibility filter, returns `{ serverNow, today, tomorrow: { count, firstTitle, hasMultiDayStart } }`. Shared Zod schema in `packages/shared`. Unit tests for tz edge cases (DST transition, UTC offset events), integration tests for visibility + userIds filtering.
60. Today route + layout — add `today` to the view union in `home/page.tsx`, wire a fourth `<Button>` into the view toggle in `calendar-header.tsx` (first position), default `view` state to `"today"` on first load (migrate existing localStorage key so returning users keep their last choice). New component `apps/web/src/components/calendar/today-view.tsx` with Morning Paper two-column layout: full-bleed hero using Fraunces `clamp(72px, 11vw, 144px)` date, subline in Fraunces italic, two-column CSS grid (`lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`), stacks to single column on `<md`. Fetches `/api/events/today` on mount and on member filter change.
61. Timeline component (`today-timeline.tsx`) — vertical timeline with Fraunces italic hour gutter (only show hours present in the event range, not all 24). Event card component with assignee avatar chip row, Inter Tight 18px title, tabular time range, location row. Visual states: past (50% opacity, no accent border), current (2px terracotta border + pulsing NOW pill, `prefers-reduced-motion` guard), future (assignee-colored left border). 1px terracotta current-time line drawn at `serverNow` position. Tap → read-only `EventDetailPopover` with "Edit" button that opens existing `EventDialog`. Auto-collapses events ending >2h before `serverNow` into a chevron-toggled "Earlier today (N)" row pinned to the top of the timeline.
62. Glance rail (`today-glance.tsx`) — right column stack. Next-up card computed from `today` + `serverNow` (first event with `end > serverNow`): Fraunces italic "Next up" label, event title in Inter Tight 20px, relative time ("in 42 minutes") using `Intl.RelativeTimeFormat`, 2px terracotta accent border. Event count chip ("5 events today · 2 for you"). Member filter chips (reuse avatar chip component from Phase 13b task 54) with "Only me" / "Everyone" quick toggles; state is `useState` only (session-scoped, not persisted), always initialized to current user. Tomorrow teaser row using `tomorrow` payload, tap → switches view to `day` with date set to tomorrow. Empty reserved `<section>` placeholder at the bottom for future weather/chores — commented, not styled.
63. Empty state + polish — when `today.length === 0`: Fraunces italic *"Nothing on the books. Enjoy the day."* centered in the timeline column, with an inline SVG sun illustration (no external asset). Glance rail still renders event count "0 events" and the Tomorrow teaser. Sticky compressed hero on scroll (Fraunces date shrinks to ~40px + row layout). Full browser verification across desktop (1440px, 1024px), tablet (768px), and mobile (390px). Verify tz correctness by toggling device timezone. Accessibility: NOW pill and relative times get `aria-live="polite"` updates every minute.

### Phase 15 — Family Page (Admin Refresh)
Reframe `/admin` as **Family** — a warm, personal surface for managing the people you live with, not a SaaS users table. Route stays `/admin` and stays admin-gated; only the UI and title change. Warm Editorial aesthetic throughout, depends on Phase 13a tokens.

**Layout**: hero header (`Family` in Fraunces italic ~88px + subline), **portrait grid** of member cards (3–4 cols desktop, 2 tablet, 1 mobile), and a **detail drawer** (Radix `Sheet`) that opens on card click instead of a modal — grid stays visible for comparison. Current user card is pinned first with a "you" tag. Last grid cell is an **Invite card** (ghost outline + large `+`) that opens the same drawer in "new" mode. Banned members get a desaturated card with a "paused" corner ribbon.

**Dropped from the current admin**: search box (never needed at family scale), separate create modal (replaced by Invite card → drawer).

**New capabilities** (small backend additions):
- **Sessions list + revoke** per user — view active devices, kick off individual sessions or "sign out everywhere." Uses Better Auth admin plugin's session APIs.
- **Temp password generator** — one-click reset that returns a crypto-random readable password, copied to clipboard with a toast ("Share it in person"). Replaces typing passwords for kids.

**Drawer sections** (top to bottom): portrait header with inline name/color edit → password (reset button + clipboard) → sessions list → role & status toggles → danger zone (remove from family).

64. Sessions API — `GET /api/admin/users/:id/sessions` → `[{ id, device, ip, lastActive, current }]`, `DELETE /api/admin/users/:id/sessions/:sessionId` (revoke one), `DELETE /api/admin/users/:id/sessions` (revoke all). Delegates to Better Auth admin plugin's session APIs; adds admin-only middleware; shared Zod schemas in `packages/shared`. Unit + integration tests for unauthorized access, self-revoke-all, non-existent sessions.
65. Temp password generator — `POST /api/admin/users/:id/reset-password` returns `{ password: string }`. Generate 14 chars from a readable alphabet (no 0/O/1/l/I ambiguity) using `crypto.randomBytes`, hash via Better Auth, persist, return plaintext only in the response (never stored or logged). Integration test verifies the returned password authenticates.
66. Family page redesign — rewrite `apps/web/src/app/admin/page.tsx`. Replace page title with "Family" in Fraunces italic ~88px + subline ("four members · managed by {admin} · last activity {relative}"). Remove the user table + search box entirely. Render a **portrait grid** (`lg:grid-cols-4 md:grid-cols-3 grid-cols-2 gap-4`) of `FamilyCard` components (new: `components/admin/family-card.tsx`): large 64px Fraunces initial in member-colored circle, Fraunces 22px name, Inter Tight 12px email, status row (terracotta dot when active + role badge), stats row in Fraunces italic ("N events · joined {month}"). Current user pinned first with a "you" tag. Banned = 40% desaturated + "paused" corner ribbon. Last cell = `InviteCard` (ghost outline + large `+` + "Add a family member"). Hover on any card: 1px terracotta border + subtle lift. Card click opens the detail drawer.
67. Member detail drawer — new component `components/admin/member-drawer.tsx` using shadcn/Radix `Sheet` (right side on desktop, bottom sheet on mobile). Sections: **Portrait header** (large avatar, inline-editable name via double-click, clickable color swatch → color picker popover, email display). **Password** — "Reset password" button → calls task 65 endpoint → copies returned password to clipboard → shows a toast "Password copied — share it in person." **Sessions** — list component rendering task 64 data with a "Sign out" button per row and "Sign out everywhere" at the bottom. **Role & status** — Admin toggle + Active/Paused toggle with a reason text field (existing ban/unban endpoints). **Danger zone** — "Remove from family" button with two-step confirmation (types member's name to confirm). Drawer also handles the "new member" mode (opened from InviteCard) — same layout with empty fields, password auto-generated on save.
68. Empty, loading, mobile polish — grid skeleton (4 shimmer cards matching the real layout). Mobile (<md): grid collapses to single column, drawer becomes a bottom sheet covering 85vh. Keyboard shortcuts: `Esc` closes drawer, `/` focuses a hidden jump-to-member input (quality-of-life for larger families). Browser verification at 1440/1024/768/390px + role-gated access check (non-admin hitting `/admin` redirects to `/`).

### Ops — Pre-deploy fixes (task 69)
Pre-existing issues on `main` that blocked the Phase 13–15 round from being deployable. Bundled as a single pre-deploy fix so the whole visual refresh + Today view + Family page ships in one update. No new features — just unblocking the pipeline.

69. Pre-deploy build + test fixes —
    - **`apps/api/src/services/ics-parser.ts`**: `node-ical` emits `summary`/`location`/`description` as `string | { val: string; params }`. Add an `icsString(v)` helper that normalizes both shapes; add a null guard on the keyed parsed entry. Fixes 4 TS2322/TS18048 errors that were failing `tsc --noEmit`.
    - **`apps/api/src/middleware/require-admin.ts`**: restore the `async` modifier on the middleware handler (Hono's `createMiddleware` types require a Promise return). Biome's `useAwait` rule is suppressed with an inline ignore comment. Fixes a TS2345 introduced during task 64.
    - **`apps/api/tests/events/series.integration.test.ts`**: the Phase 9 task 40 FK `events.seriesId → series.id` was added after these tests were written; they were inserting events pointing at synthetic `randomUUID()` seriesIds and hitting the FK constraint. Add a `createSeries()` helper that inserts a real series row + add `schema.series` to the `beforeEach` cleanup list; the 3 non-existent-series 404 tests keep a hardcoded zero UUID. Fixes 5 failing tests.
    - **Verification**: `pnpm lint` clean, `pnpm build` clean for both @homecal/api and @homecal/web, `pnpm --filter @homecal/api test` 25 files / 345 passing (was 24/340).

### Phase 16 — Multi-app API: open HomeCal as a shared service
HomeCal's backend is already a real HTTP service (Hono + Drizzle + Postgres + Better Auth with cookie + bearer plugins). Before other "home apps" can call into it safely, four things need to be in place: proper machine-auth, per-caller rate limiting, API versioning so we can evolve without breaking consumers, and self-documenting OpenAPI so the other apps can generate typed clients.

**Ordering rationale**: API keys first (blocks real machine callers), then rate limit (protects once keys exist), then versioning (locks the schema before we publish it), then OpenAPI (snapshots the locked schema).

70. API key plugin — enable Better Auth's first-party `apiKey` plugin from `better-auth/plugins`. Adds an `api_keys` table with rotation + revocation semantics. New routes (admin-only): `POST /api/admin/api-keys` (create — returns plaintext once), `GET /api/admin/api-keys` (list with masked values), `DELETE /api/admin/api-keys/:id` (revoke). Update `requireAuth` middleware to accept an `x-api-key` header in addition to cookies + bearer, resolving to the owning user so existing role checks (including `requireAdmin`) just work. Shared Zod schemas in `packages/shared`. Unit + integration tests: create/list/revoke, expired key rejection, admin-scoped key passes `requireAdmin`, regular-scoped key fails it. Document the "create one service user per calling app" pattern in `docs/lessons.md`.

71. Rate limiting — add `hono-rate-limiter` as a middleware applied to `/api/*` with a per-caller key that prefers `x-api-key` value, falling back to session user id, then IP address. Defaults: 600 req/min per key, burst of 60 req/sec. Configurable via `RATE_LIMIT_PER_MIN` env var. Returns `429` with a `Retry-After` header. Short-circuit admin calls at 1200 req/min to avoid throttling the web UI. Unit test: helper that extracts the rate-limit key. Integration test: 600 sequential calls pass, 601st returns 429.

72. API versioning — introduce a `/api/v1` prefix. Keep the legacy `/api/*` mounts temporarily so existing web + iOS clients don't break, emitting a `Deprecation` + `Sunset` header on legacy routes. Web + iOS clients stay on `/api/*` for now; migrate them in a follow-up (task 73a) once v1 is stable. Write a short `docs/api-versioning.md` documenting the policy: breaking changes require a new version; additive changes (new fields, new endpoints) go on the current version. Update `apps/api/src/app.ts` to mount under both prefixes. Integration test verifying both `/api/events` and `/api/v1/events` return identical payloads, plus a header assertion on the legacy path.

73. OpenAPI + Swagger UI — add `@hono/zod-openapi` + `@hono/swagger-ui`. Migrate each route group (`events`, `series`, `reminders`, `users`, `devices`, `admin`) from plain `new Hono()` + handler callbacks to `new OpenAPIHono()` + `createRoute({ method, path, request, responses })`. Every existing shared Zod schema gets `.openapi({ description, example })` annotations in `packages/shared/src/index.ts`. Mount `/api/docs` (Swagger UI) and `/api/openapi.json` (spec) — admin-gated in prod, open in dev. Verification: hit `/api/openapi.json`, round-trip through `openapi-typescript` to generate a client, run a smoke call against one endpoint.

**Not in scope for Phase 16** (explicitly deferred):
- Migrating web + iOS clients off `/api/*` onto `/api/v1/*` — tracked as a later task once v1 is proven.
- OAuth / external-app delegated auth (e.g. another family's HomeCal talking to ours). API keys cover internal apps; OAuth is a different problem.
- Webhook outbound events (HomeCal → other apps). Polling works for now.

### Phase 17 — Service Account & API Key Management UI
Phase 16 shipped the **infrastructure** for service-to-service calls (Better Auth apiKey plugin, rate limit, `/api/v1` versioning, OpenAPI spec). This phase ships the **management surface** so admins can create, monitor, rotate, and revoke service accounts and their keys without ever touching curl. Adds a "Services" tab to the existing `/admin` Family page.

**Mental model** (recorded in `lessons.md`): HomeCal uses the GitHub PAT pattern. A service account is just a normal user record with `isService=true`, password is a throwaway (random + discarded). The actual credential is the API key minted under that user. The user record exists as a permission anchor — its role determines whether keys minted under it can hit admin routes.

**Aesthetic direction** (locked, Warm Editorial):
- Service cards are **square (1:1)** to break visual rhythm from family's portrait (4:5)
- **Inline SVG line-art icons** (key, terminal, robot) instead of colored avatar circles — signals "machine, not person"
- **Fraunces** for the service name (consistency); **IBM Plex Mono** for masked key prefixes (`hc_••••a3f2`) — typography signals "machine"
- **No member color** — service cards use foreground/muted with terracotta accent only on hover and active key states
- **Tab switcher** at the top of the Family page: `[Family] [Services]`, same pill style as the calendar view toggle, `?tab=services` URL persistence
- **Reveal-once card** for plaintext keys reuses the temp-password reveal pattern from task 67 (terracotta border, monospace text, Copy + Check confirmation)

#### Backend

74. Service account flag + one-shot create endpoint —
    - **Migration**: add `users.isService boolean not null default false`
    - **New route** `POST /api/admin/service-accounts` with body `{ name, role: "user" | "admin", color? }`. Generates 32 bytes of random as a throwaway password, calls `auth.api.createUser`, sets `isService: true`, returns the new user record (no password in response).
    - **Filter** `GET /api/users` to `WHERE isService = false` so the calendar member filter never shows service accounts.
    - **Better Auth** `admin.listUsers` keeps returning everyone — admin needs to see them; the family-card filter at the UI layer hides them from the Family tab.
    - **Tests**: 401 unauth, 403 non-admin, 400 invalid name, 200 create + flag set, `/api/users` excludes them, role honored.

75. API key list metadata + rotation endpoint —
    - **Update `GET /api/admin/api-keys`** response to include `lastRequest`, `requestCount`, `enabled`, `name` (already exist on the row, just surface them).
    - **New `POST /api/admin/api-keys/:id/rotate`** — looks up the existing key, mints a new one with the same `name` and `userId` via `auth.api.createApiKey`, returns the new plaintext. **Does NOT auto-delete the old key** — admin manually revokes after migrating the calling app. Keeps a grace period without scheduled-deletion complexity.
    - **Tests**: rotate creates new key, response has plaintext, old key still works until manually revoked, 401/403/404 cases.

76. Service accounts list endpoint —
    - **New `GET /api/admin/service-accounts`** returns shaped `[{ user: {id, name, role, banned, createdAt}, keys: [{id, name, prefix, lastRequest, requestCount, enabled, createdAt, expiresAt}] }]` for everyone with `isService=true`. Single roundtrip avoids N+1 fetches in the UI.
    - **Tests**: 401, 403, empty list, populated list with multiple keys per service, ordering.

#### Frontend

77. Tab switcher + Services list page —
    - **Refactor `app/admin/page.tsx`** to render a tab switcher under the hero with two segments (`Family`, `Services`), `?tab=services` URL persistence, default = `Family`.
    - **Family tab** keeps the existing portrait grid filtered to `!isService` users.
    - **Services tab** renders new `components/admin/services-grid.tsx` — square cards (`aspect-square`), inline SVG line-art icon at top-left, Fraunces name centered, Inter Tight role badge + Active/Paused dot, IBM Plex Mono `N keys · last active {relative}` row at the bottom. Last grid cell is `AddServiceCard` (ghost dashed, large `+`, "Add a service account") opening the drawer in `new` mode.
    - **New `useServiceAccounts()` hook** fetches `/api/admin/service-accounts`.

78. Service Account drawer —
    - **New `components/admin/service-account-drawer.tsx`** using the existing `<Sheet>` primitive (right side, slides full-width on mobile via the responsive variant from task 68).
    - **Sections**:
      - **Header**: large square line-art icon, Fraunces name (inline editable on click), Inter Tight italic role + status row.
      - **Identity**: name + email + role toggle + Active/Paused switch, all inline. Color picker omitted (services don't appear in the calendar).
      - **API keys** — the main payload:
        - List of keys: small key icon + Inter Tight medium name + IBM Plex Mono masked prefix (`hc_••••a3f2`) + Fraunces italic relative `lastRequest` (or "never used") + tabular `requestCount`. Per-row "Rotate" + "Revoke" buttons.
        - **Mint new key** terracotta button at the top of the section. Click → inline form with a `name` text input + Mint button → on success, replaces the form with a reveal-once card showing the plaintext key + Copy button + Check confirmation icon (same pattern as the temp password flow from task 67). Rotated keys also surface their plaintext via the same card.
      - **Danger zone**: "Remove service account" with two-step name-confirm (same pattern as task 67 member drawer).
    - **New-mode** (opened from `AddServiceCard`): identity fields blank, no API keys section (no service yet), Save button creates the service account → on success transitions the drawer into edit mode for the just-created account so the admin can immediately mint the first key.

79. Polish + browser verification —
    - **Empty state** for the Services tab: Fraunces italic *"No service accounts yet — add your first one to let other apps talk to HomeCal."* + inline SVG key/terminal illustration + AddServiceCard.
    - **Loading skeletons**: 4 shimmer square cards for the grid, monospace shimmer rows for the keys list inside the drawer.
    - **Confirmation toasts/inline messages** for rotate + revoke (reuse the temp-password copy/check pattern — no sonner dep needed).
    - **Browser verification** at 1440/1024/768/390px for both tabs and the drawer in both modes.
    - **Update `lessons.md`** with the GitHub PAT mental model (HomeCal uses the user-as-permission-anchor model, password is vestigial).

### Phase 18 — National holidays (multi-country, read-only layer)
Follows the universal calendar-app pattern: holidays are a **separate, read-only layer**, not mixed into the user's events. Backed by the pure-JS `date-holidays` npm package (MIT, 200+ countries, zero network calls) so there's no DB storage, no sync job, and no admin UI — holidays are computed on-the-fly from `(country, year)` at request time.

**Scope for v1**:
- Public holidays only (`date-holidays` `type: "public"`). Observances like Halloween / Mother's Day deferred to a later phase.
- Multi-country from day one — a family can enable e.g. US + TW + UK simultaneously.
- Read-only: no edit, no delete, no assignees, not counted in event counts or member filters.

**Visual treatment — "kicker line"** (locked):
- Small Fraunces italic lowercase text above the date numeral with a terracotta `·` dot prefix (e.g. `·  memorial day`). No background pill, no country flag — pure typography.
- Multi-country dedupes to one line with `·` separators (`·  memorial day · 陣亡將士紀念日`).
- Month grid: positioned above the numeral, truncates on narrow cells, absolute-positioned so it doesn't eat into the 3-pill cell budget.
- Week/Day view: same kicker at the top of each day column.
- Today view: inline between the weekday label and the massive date hero.
- Click → existing `EventDetailPopover` in a new `readOnly` mode (title, country, type, no Edit button).

Why not a ribbon/pill: too AI-default. Italic kicker + terracotta dot is typographic-forward, matches the rest of Warm Editorial, and avoids competing with event pills for cell space.

80. Holidays service + endpoint — add `date-holidays` as an `@homecal/api` dependency. New `apps/api/src/services/holidays.ts` with `getHolidays({ countries, from, to })` that iterates year ranges, filters `type === "public"`, dedupes by `date|title` across countries, and returns `[{ date, title, country, type }]`. New route `GET /api/holidays?countries=US,TW&from=...&to=...` with shared Zod schema (comma-separated countries, ISO date range). Response is cached per `(countries, from, to)` tuple for the lifetime of the request via a small in-memory LRU (~100 entries) to avoid recomputing when month + week views both query the same range. Unit tests: year-boundary span (Dec 20 → Jan 5 picks up both years), multi-country dedup (July 4 US alone, May 5 in TW alone, single result), public-only filter (no Halloween), unknown country code returns 400.

81. User country preference — migration adds `holidayCountries text[]` (nullable) to the `users` table. Better Auth's admin/updateUser already accepts arbitrary `data: { ... }` fields so no plugin changes needed. New GET/PATCH at `/api/users/me/preferences` for the current user to read/write their own countries (avoids routing through Better Auth for the hot path). Default on first visit: derive from `Intl.DateTimeFormat().resolvedOptions().locale` region segment (e.g. `en-US` → `["US"]`), persist on first save. Shared Zod schema `userPreferencesSchema` in `packages/shared`. Unit tests for locale → country mapping + the schema; integration test for GET/PATCH round-trip.

82. Kicker rendering across calendar views — new `useHolidays(countries, from, to)` hook mirroring `useEvents`. `day-cell.tsx` gets a `holidays` prop and renders a `HolidayKicker` component absolutely positioned at the top of the cell (above the date numeral), Fraunces italic lowercase, `text-[10px]` with tracking-tight, terracotta `·` prefix, truncates. Cell `min-h-*` stays the same (kicker is absolutely positioned). `week-grid.tsx` + `day-grid.tsx` headers get the same kicker. `month-grid.tsx` + `week-grid.tsx` fetch holidays once per view-range load via the shared hook. Click opens `EventDetailPopover` in a new `readOnly` mode — added as an optional prop so month-view "+N more" keeps its existing behavior.

83. Today view holiday line + settings UI — `today-view.tsx` renders an italic kicker (`"memorial day — observed in us"`) between the weekday label and the massive date hero, only when `today` is a holiday. Count is unaffected — holidays never appear in "N events today". In the `calendar-header` settings modal, add a new **Holidays** section: Fraunces italic label, a multi-select of country codes with a small searchable list sourced from `date-holidays`'s `getCountries()` (about 200 entries, lazy-loaded), default pulled from locale. Save goes through the task-81 PATCH endpoint. Also flag a "Show observances too" checkbox but keep it wired to a no-op for v1 (future-proofing without shipping the feature). Browser verification at 1440/1024/768/390px on a known holiday date.

### Phase 19 — k3s migration (web + API + DB, iOS deferred)

Move HomeCal off the single-host `docker compose` stack onto the home k3s cluster managed by `arch-infra` (Argo CD GitOps). Follows the playbook validated on llmgw (2026-05) and homenews (Phase 17). **Scope: web + API + DB only.** iOS app deliberately left to break post-cutover — `LocalConfig.swift` update is a separate follow-up once `*.arch.local` DNS resolves on the device.

**Why now**:
- HomeCal is the last app on docker-compose-on-host; llmgw + homenews already migrated.
- `LLM_GATEWAY_URL=http://localhost:51277` is already broken (llmgw moved to cluster). Smart Input has been silently failing in prod. Fix requires pointing at `llmgw.llmgw` cluster Service DNS — easiest done as part of this migration.
- Loki retention rule for `homecal` namespace already pre-provisioned in arch-infra (30-day retention) — dormant until HomeCal lands.

**Cluster shape** (target):
```
namespace: homecal
├── statefulset/homecal-db        postgres:17-alpine (1 replica, Recreate, fsGroup 999, 5Gi PVC)
├── deployment/homecal-api        ghcr.io/autumnfallenwang/homecal-api:<sha> (1 replica, Recreate)
├── deployment/homecal-web        ghcr.io/autumnfallenwang/homecal-web:<sha> (1 replica, RollingUpdate)
├── job/homecal-migrate           Helm pre-install/pre-upgrade hook, drizzle-kit migrate
├── secret/homecal-secrets        BETTER_AUTH_SECRET, EMAIL_PASSWORD, APNS_PRIVATE_KEY, POSTGRES_PASSWORD (manual)
├── service/homecal-{db,api,web}  ClusterIP (db is headless)
├── ingress/homecal-web           Traefik, host homecal.arch.local
└── ingress/homecal-api           Traefik, host homecal-api.arch.local
```

**Key decisions** (locked):
- **Two ingresses, not path-based routing** — mirrors llmgw/homenews; avoids CORS/rewrite issues with Better Auth's `/api/auth/*`.
- **API uses Recreate** because reminder-scheduler is a `setInterval` singleton — two replicas would double-fire reminders. Same constraint as homenews's pipeline scheduler.
- **postgres:17-alpine, NOT pgvector** — homecal doesn't use embeddings, so the smaller image suffices.
- **Plaintext k8s Secret for cutover, Sealed Secrets later** — unlike llmgw/homenews (LAN-trivial passwords), HomeCal has real secrets. Sealed Secrets bootstrap is a separate follow-up to avoid doubling the cutover surface area.
- **`drizzle-kit migrate` going forward, not `push`** — push was the root cause of the historical orphaned-sessions/wiped-users mystery in the prod DB. Switch dev workflow and adopt a Helm pre-install Job for the cluster.
- **Adopt pino + request-log middleware** — homenews's logger contract was explicitly designed to be portable to homecal. Without it, Loki queries can only regex; with it, `{namespace="homecal", service="homecal-api"} | json | level="error"` works day one.
- **Preserve DB name `homecal_prod` and password `homecal_prod`** — keeps the pg_dump/restore trivial; rename is a separate follow-up if ever needed.
- **`BETTER_AUTH_URL=http://homecal-api.arch.local`** — Better Auth's `/api/auth/*` lives on the API host.
- **iOS out-of-scope** — accept the break, update `LocalConfig.swift` later.

**Full plan**: see [phase19-k3s-migration-memo.md](phase19-k3s-migration-memo.md) for the 41-task breakdown (84–124) across phases A (code touchups + logging), B (Helm chart), C (Dockerfiles), D (CI), E (arch-infra registration), F (secrets), R (runbook), G (data migration), H (cutover), I (cleanup). Also includes the cross-namespace Service DNS map, securityContext placement rules (pod-level vs container-level), and the post-restore `__drizzle_migrations` bootstrap (since the source DB never had a migrations table).

**Out of scope (deliberately, mirrored from homenews phase17 memo)**: Sealed Secrets install, Grafana dashboards for homecal, HPA/multi-replica, PVC backups, iOS LocalConfig.swift update, APNs E2E push test (requires iOS device on new URL), `homecal` CLI deprecation (retain for 7-day rollback window).

### Phase 20 — Public API ergonomics for external apps (placeholder)

**Motivation**: Phase 16 opened HomeCal to machine callers (apiKey plugin, rate limit, `/api/v1`, OpenAPI spec) and Phase 17 built the management UI. Actually *using* the API as an external service still has sharp edges — e.g., "give me all events for user X" today requires `GET /users` then `GET /events?from=...&to=...` then a client-side filter on `assignees[]`, with a privacy-model caveat that a non-admin key can't see other users' private events at all.

**Rough scope** (to be refined in a real planning pass):
- **Filter parameters on list endpoints** — `userIds` on `/events` (mirroring `/events/today`), `ownerId`, maybe `assigneeId`, `limit`/`cursor` pagination
- **Resource-per-user views** — e.g. `GET /users/{id}/events?from=&to=` as a first-class path so the natural URL exists
- **Privacy model for service accounts** — decide whether a service account key can bypass the `private` filter when its role is admin, or whether private events are strictly hidden regardless of key scope (probably the latter — service accounts aren't humans)
- **Bulk endpoints** — create N events in one call, fetch several users in one call, avoiding chatty round-trips
- **Consistent error envelope** — standardize `{ error, code, details }` across every route so clients can branch on `code`
- **Rate-limit header documentation** in the OpenAPI spec + concrete retry guidance
- **Typed client generation sanity check** — run `openapi-typescript` + `openapi-generator` against the spec from a fresh repo and note what's awkward; that's the real usability test
- **SDK / example** — tiny Node snippet in `docs/` showing "list today's dinner plans for the kids" end-to-end, so new external apps have a copy-paste starting point

**Deliverables** (TBD — tasks numbered when this phase is planned for real): a set of small focused PRs, each with tests + OpenAPI spec updates in the same commit.

### Phase 21 — Daily Digest (admin-configured morning email)

An admin-configured email that summarizes the day's family calendar and lands in chosen family members' inboxes each morning. Reuses the existing reminder-scheduler cadence and the `today` service; adds an admin-only **Notifications** tab to `/admin`. Mockup approved 2026-07-08.

**Design decisions**:
- **Admin-only, family-level config.** One digest for the household, configured on a new **Notifications** tab in `/admin` (alongside Family, Services), admin-gated. Not a per-user preferences screen.
- **Recipients = member multi-select.** A color-chip picker like the event assignee control; each selected member receives the *same* summary at their own email. Stored as a per-user `receivesDailyDigest` flag so the chips map straight onto it. Defaults to everyone.
- **Schedule is one family-level config**: `enabled`, `sendAt` (local `HH:MM`), `timezone` (IANA, selectable dropdown next to the time, default `America/New_York`). One send per day; dedup via a `lastSentOn` local-date marker. Fire condition (`isDigestDue`) is *enabled AND local time is within a short window `[sendAt, sendAt + 5 min)` AND not yet sent today*. **Deliberately a narrow window, not "≥ sendAt all day"** — otherwise merely *enabling* the digest in the afternoon retroactively fires it. The 5-min grace absorbs a delayed 60s tick / quick restart; only reaching the send time (or "Send test") dispatches.
- **Why timezone is explicit here and nowhere else.** Event `start`/`end` are UTC `timestamptz`; interactive views render them in the *browser's* zone (`Intl…resolvedOptions().timeZone`), so the zone was always implicit. The digest runs server-side on a timer with no browser, so both "when to fire" and "what counts as today" need an explicit zone. Single household → one selectable family timezone; it's the only place in the app tz is pinned.
- **Content = all non-private events for that local day.** Private events are excluded entirely, including a recipient's own (deliberately stricter than `/today`, which shows an owner their own private events). Each event lists: start–end time, title, location (when set), assignees (color dots + names). No description / owner / reminders.
- **Reuse, don't rebuild.** Extract the today-events query from the `/api/events/today` handler into `services/today.ts` `getTodayEvents({ tz, userIds, now })`; the endpoint and the digest both call it. Digest dispatch piggybacks on `startReminderScheduler`'s 60s tick (a sibling `checkDueDigests`) and `services/email.ts`.

**Tasks**:
125. **Schema + shared types.** Additive migration: family digest config (`enabled`, `sendAt`, `timezone`, `lastSentOn`) + per-user `receivesDailyDigest`. Zod schemas in `packages/shared`. Generate via `db:generate`; additive-only.
126. **Extract `getTodayEvents()`** into `services/today.ts` and point `/api/events/today` at it — behavior-preserving, covered by the existing today integration tests.
127. **Digest builder + email.** Render the summary (time · title · location · assignees, private excluded) as text (+ optional HTML); add `sendDigestEmail` to `services/email.ts`, gated by `getEmailConfig()`.
128. **Digest scheduler.** `checkDueDigests()` on the 60s tick: for the family config, if enabled and local-time ≥ `sendAt` and `lastSentOn` ≠ today, build the summary and email each recipient, then stamp `lastSentOn`. Injectable `DispatchFns` for tests.
129. **Config API.** Admin `GET`/`PATCH` for the digest config + recipient toggles; an admin **"send test digest now"** endpoint that dispatches immediately to current recipients.
130. **Notifications tab (web).** New admin-only tab on `/admin`: enable toggle, send-at time + timezone dropdown, recipient chips, "Send test" button — Warm Editorial aesthetic. Config shape: on/off · send-at + tz · recipients.
131. **Tests.** Unit: send-time-in-tz match, dedup (no double-send), private exclusion, digest rendering, empty-day handling. Integration: seed today's events, set `sendAt` to "now", tick → exactly one email per recipient with correct contents; second tick → no resend. Email mocked at the module boundary.

132. **HTML email template.** The digest currently sends plain text only; add a nicer HTML body. `renderDigestHtml()` beside `renderDigest()` in `services/digest.ts` produces an **email-safe** HTML body — table-based layout, inline styles, hex colors, Georgia serif (email-safe, matches the app) — following the approved mockup: warm-editorial masthead (sun mark + `HOMECAL`), big serif date + count pill, one row per event (time · title · location-with-pin · colored assignee chips, "Everyone" for all-family), hairline footer ("private events are left out"). Extend `sendMail`/`sendDigestEmail` to pass `html` alongside `text` (nodemailer sends both; **plain text stays the fallback**); `dispatchDigest` builds both from the same event list. Test asserts the HTML contains each event's title / time / location / assignee names and the empty-day copy. Mockup approved 2026-07-08.

133. **Printable digest page.** A "Print" button on the Notifications tab opens `GET /api/admin/digest/print` (admin-gated) in a new tab — a standalone HTML page of today's digest that auto-opens the browser print dialog and hides its own toolbar via `@media print`. Reuses the email card: `renderDigestHtml` and a new `renderDigestPrintPage` share `renderDigestCardHtml`; the today-events build is shared via `buildTodayDigestEvents`. Tests: unit (page contains the digest + `window.print()`) + integration (admin 200 text/html, non-admin 403, unauth 401).

**Out of scope for Phase 21** (deferred):
- Per-user custom send times (single family time for v1).
- Per-recipient content filtering — everyone gets the same day summary.
- Push-channel digest (email only for now).
- Weekly / monthly digests; a "skip days with no events" toggle.

### Backlog — Future Enhancements (deferred)
- iOS LocalConfig.swift update post Phase-19 cutover — point at homecal-api.arch.local; requires LAN DNS resolution on device
- Sealed Secrets bootstrap — encrypt secrets at rest in arch-infra (no-downtime env source swap once operator is installed)
- iOS push via APNs — enable when Apple Developer account is available
- Web Push notifications — Service Worker + Web Push API (add if users want desktop alerts)
- iOS voice input — Speech framework mic button → parse endpoint (requires physical device)
- Today view ambient widgets — weather, chores/waiting-on, shopping list (fill the reserved rail slot)
- iOS "Today" view — port Morning Paper layout to SwiftUI
- iOS Family page — port portrait grid + drawer layout to SwiftUI
- Migrate web + iOS clients off legacy `/api/*` onto `/api/v1/*` once Phase 16 stabilizes
- Outbound webhooks (HomeCal publishes events to other home apps)
- Holidays v2 — observances, custom holidays, per-user holiday toggle (not country-wide), school/bank holiday types
