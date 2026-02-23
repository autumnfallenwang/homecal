# HomeCal

Smart family calendar — Turborepo monorepo with Hono API + Next.js frontend.

## Stack

Turborepo + pnpm | Hono + Zod (API) | Next.js App Router (Web) | PostgreSQL + Drizzle | Better Auth | Vitest + Biome

## Structure

- `apps/api/` — Hono backend API (port 3001)
- `apps/web/` — Next.js frontend (port 3000)
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

### When to use which test command

- **During development** (`/commit`, `/check`, iterating on code): use `pnpm test:fast`
- **Completing a feature** (`/dev-task`, pre-merge validation): use `pnpm test` (full suite)
- **Debugging a specific test**: use `pnpm --filter @homecal/api exec vitest run tests/<file>`

## Docs

- [docs/progress.md](docs/progress.md) — current progress tracker
- [docs/design-plan.md](docs/design-plan.md) — app design and build phases
