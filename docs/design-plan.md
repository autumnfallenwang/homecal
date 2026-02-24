# Family Calendar — Design Plan

## Concept

A smart family calendar app running on a local home network. Each family member has an account and can view everyone's shared events in one place. Future: LLM-powered smart input (image/voice/text → structured events).

## Tech Stack

| Layer | Tech |
|-------|------|
| Monorepo | Turborepo + pnpm |
| Web Frontend | Next.js (App Router) |
| Backend API | Hono |
| Auth | Better Auth (email+password, session cookies) |
| Validation | Zod (shared schemas) |
| Database | PostgreSQL (Docker) + Drizzle ORM |

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

- Better Auth with email+password, session cookies
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

- **Local**: All services on Arch Linux desktop, accessible via LAN (`http://<ip>:3000`)
- **Future cloud**: Docker Compose or split (Vercel + Fly.io + managed PostgreSQL)
- **Future mobile**: Swift iOS app calls the same Hono API (Better Auth bearer token plugin)

## Build Phases

### Phase 1 — Core (web UI + manual input)
1. Scaffold monorepo (Turborepo + pnpm + Next.js + Hono)
2. PostgreSQL (Docker) + Drizzle ORM schema + migrations
3. Better Auth (register, login, session)
4. CRUD events API (Hono endpoints)
5. Users list endpoint (`GET /api/users` for member filter)
6. Frontend setup (Tailwind + shadcn/ui, auth pages, session management)
7. Calendar month view (month grid, event pills, member filter sidebar)
8. Event create/edit/delete UI (modal dialog)
9. Event change log UI
10. Deploy on LAN for family use

### Phase 2 — Enhancements (future)
- Week view (hourly time-slot grid, month/week toggle)
- Admin UI (user management — Better Auth admin APIs already exist)
- Smart input via llm-gateway (image/voice/text → structured events)
- Notifications/reminders

### Phase 3 — Mobile (future)
- Swift iOS app calling same Hono API
- Better Auth bearer token plugin for mobile auth
