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

## UI Overview

### Default View
- Monthly/weekly calendar showing all family members' shared events
- Events color-coded by owner
- Sidebar checkboxes to filter by family member

```
┌──────────────────────────────────────┐
│  February 2026                       │
│                                      │
│  Mon 23                              │
│   🟢 Dad: Gym 6pm                   │
│   🔵 Mom: Dentist 2pm               │
│   🟠 Kid: Soccer practice 4pm       │
│                                      │
│  Filter:                             │
│   ☑ 🟢 Dad                          │
│   ☑ 🔵 Mom                          │
│   ☑ 🟠 Kid                          │
└──────────────────────────────────────┘
```

### Event Creation
- "New Event" button → form with title, date/time, private toggle

### Event Detail
- Tap an event to view/edit
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
5. Calendar web UI (monthly/weekly view, create/edit/delete events, filter by member)
6. Event change log
7. Deploy on LAN for family use

### Phase 2 — Smart input (future)
- LLM-powered input via llm-gateway (image/voice/text → structured events)
- Notifications/reminders

### Phase 3 — Mobile (future)
- Swift iOS app calling same Hono API
- Better Auth bearer token plugin for mobile auth
