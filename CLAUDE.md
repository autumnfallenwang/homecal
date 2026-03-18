# HomeCal

Smart family calendar — Turborepo monorepo with Hono API + Next.js frontend + iOS Swift app.

## Stack

Turborepo + pnpm | Hono + Zod (API) | Next.js App Router (Web) | Swift + SwiftUI (iOS) | PostgreSQL + Drizzle | Better Auth | Vitest + Biome | SwiftLint

## Structure

- `apps/api/` — Hono backend API (port 3001)
- `apps/web/` — Next.js frontend (port 3000)
- `apps/ios/` — SwiftUI iOS app (Swift Package Manager)
- `packages/shared/` — shared Zod schemas and types
- `docs/` — design docs

## Commands

All commands run from the repo root via Turborepo:

- `pnpm dev` — start all dev servers (API + Web) in parallel
- `pnpm build` — build all packages
- `pnpm test` — run all tests
- `pnpm test:fast` — unit tests only
- `pnpm lint` — lint check all packages
- `pnpm lint:fix` — auto-fix lint

### Per-package commands

- `pnpm --filter @homecal/api dev` — start only the API server
- `pnpm --filter @homecal/web dev` — start only the web frontend
- `pnpm --filter @homecal/api test` — run API tests only

### iOS / Swift commands

- **First-time setup**: `cp apps/ios/HomeCal.swiftpm/Sources/HomeCalKit/LocalConfig.swift.example apps/ios/HomeCal.swiftpm/Sources/HomeCalKit/LocalConfig.swift` — then edit with your LAN IP
- `cd apps/ios/HomeCal.swiftpm && xcodebuild build -scheme HomeCal -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet` — build iOS app
- `cd apps/ios/HomeCal.swiftpm && swiftlint` — lint Swift code
- `cd apps/ios/HomeCal.swiftpm && swift test` — run Swift tests (when test target exists)

### When to use which test command

- **During development** (`/commit`, `/check`, iterating on code): use `pnpm test:fast`
- **Completing a feature** (`/dev-task`, pre-merge validation): use `pnpm test` (full suite)
- **Debugging a specific test**: use `pnpm --filter @homecal/api exec vitest run tests/<file>`
- **iOS tasks**: `/check swift` or `/test swift` to run only Swift checks

## Docs

- [docs/progress.md](docs/progress.md) — current progress tracker
- [docs/design-plan.md](docs/design-plan.md) — app design and build phases
- [docs/lessons.md](docs/lessons.md) — corrections and patterns to avoid repeating
