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
Event           { id, title, start, end, ownerId, private, createdAt, updatedAt }
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

- **Backend**: Arch Linux desktop — Hono API (port 3001) + PostgreSQL + llm-gateway, bound to `0.0.0.0` for LAN access
- **Web**: Next.js on same machine (port 3000), accessible from any browser on LAN
- **iOS**: Swift app on iPhones, connects to backend via LAN IP (e.g. `http://192.168.x.x:3001`)
- **Future cloud**: Docker Compose or split (Vercel + Fly.io + managed PostgreSQL)

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
User management for the admin (first registered user). Better Auth already provides admin APIs (`/api/auth/admin/*`).
31. Admin web UI — user management page: list users, delete users (cascade removes their events/assignees/reminders/device tokens), clean up test accounts. Admin-only route, accessible from header menu.

### Phase 7 — Future Enhancements (deferred)
- iOS push via APNs — enable when Apple Developer account is available
- Web Push notifications — Service Worker + Web Push API (add if users want desktop alerts)
- iOS voice input — Speech framework mic button → parse endpoint (requires physical device)
- Cloud deployment (Docker Compose / Vercel + Fly.io)
- Recurring events — repeat rules (daily/weekly/monthly)
