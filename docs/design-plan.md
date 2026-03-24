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
User     { id, name, color, passwordHash, createdAt }
Event    { id, title, start, end, ownerId, private, createdAt, updatedAt }
EventLog { id, eventId, userId, action, changes, timestamp }
```

## Core Rules

- Each user has ONE calendar (their own events)
- Events default to **shared** (visible to all family members)
- User can toggle an event to **private** (only they can see/edit it)
- Shared events can be **edited/deleted by anyone**
- All changes to shared events are logged (EventLog) for transparency
- Private events are only visible to and editable by the owner

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

### Phase 3 — LAN + iOS App (current)
13. LAN expose — bind Hono API to `0.0.0.0`, verify LAN access from other devices
14. Better Auth bearer token plugin — enable token-based auth for mobile clients
15. iOS project setup — Swift package, Xcode project, API client targeting LAN backend
16. iOS auth — login/register screens, bearer token storage in Keychain
17. iOS calendar views — month + week views in SwiftUI
18. iOS event CRUD — create/edit/delete events with sheets, change log with field diffs
19. iOS smart input — NLP text/voice input → parse endpoint → pre-fill event form
20. iOS day view — tappable day detail with event list (week header → day drill-down)
21. iOS notifications — local reminders for upcoming events

### Phase 4 — Future Enhancements (deferred)
- Admin UI (user management — Better Auth admin APIs already exist)
- Web notifications/reminders
- Cloud deployment (Docker Compose / Vercel + Fly.io)
- Push notifications via APNs (requires backend addition for device tokens)
