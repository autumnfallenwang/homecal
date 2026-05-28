# HomeCal

Smart family calendar — Turborepo monorepo with Hono API + Next.js frontend + iOS Swift app.

## Stack

Turborepo + pnpm | Hono + Zod (API) | Next.js App Router (Web) | Swift + SwiftUI (iOS) | PostgreSQL + Drizzle | Better Auth | Vitest + Biome | SwiftLint

## Structure

- `apps/api/` — Hono backend API (dev: 3001, prod: 51001)
- `apps/web/` — Next.js frontend (dev: 3000, prod: 51000)
- `apps/ios/` — SwiftUI iOS app (Swift Package Manager)
- `packages/shared/` — shared Zod schemas and types
- `deploy/` — Docker deployment (compose, Dockerfiles, CLI script)
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

### Production (k3s — Phase 19, 2026-05-27)

HomeCal runs in the home k3s cluster managed by `~/github/arch-infra` (Argo CD GitOps). Pushing to `main` triggers GHA → image build → push to `ghcr.io/autumnfallenwang/homecal-{api,web}` → arch-infra image-tag bump → Argo CD reconcile → pod roll. End-to-end deploy: ~3-5 min from `git push`.

URLs (LAN-only):
- Web: `http://homecal.arch.local`
- API: `http://homecal-api.arch.local`
- Grafana logs: `http://grafana.arch.local` → Explore → Loki → `{namespace="homecal"}`
- Argo CD: `http://argocd.arch.local`

Common ops:

```bash
# Tail logs (one pod, current)
kubectl logs -n homecal deploy/homecal-api -f

# Loki history (30d retention)
curl -sG http://loki.arch.local/loki/api/v1/query_range \
  --data-urlencode 'query={namespace="homecal"} | json | event="reminder.dispatch.email"' \
  --data-urlencode "start=$(date -u -d '-1 hour' +%s)000000000" \
  --data-urlencode "end=$(date -u +%s)000000000"

# Force a re-sync (skip Argo CD's 3-min poll)
kubectl annotate app homecal -n argocd argocd.argoproj.io/refresh=hard --overwrite

# Bump log level at runtime
kubectl set env -n homecal deploy/homecal-api LOG_LEVEL=debug
kubectl rollout status -n homecal deploy/homecal-api

# Inspect cluster DB
kubectl -n homecal exec homecal-db-0 -- psql -U homecal -d homecal_prod
```

Secrets (`homecal-secrets` k8s Secret, namespace `homecal`):
- Created via `scripts/create-cluster-secret.sh` from `cluster-secrets.env` (gitignored, root)
- Holds DATABASE_URL, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, EMAIL_FROM, EMAIL_PASSWORD, APNS_PRIVATE_KEY
- Rotate: edit `cluster-secrets.env`, re-run the script (idempotent `kubectl apply`), restart api pod

### Dev vs Prod

- **Dev**: feature branches, `pnpm dev`, dev DB on port 5432, hot reload. `apps/api/.env` holds dev DATABASE_URL + LLM_GATEWAY_URL=http://llmgw.arch.local
- **Prod**: main branch, k3s cluster, cluster DB on port 5432 in-cluster
- **Deploy**: merge to main → GHA builds + pushes images + bumps arch-infra → Argo CD applies
- **Migrations**: SQL files in `apps/api/drizzle/`, applied via `pnpm --filter @homecal/api db:migrate` (dev) or the Helm pre-install Job (cluster, flip `migrate.enabled=true` in arch-infra to activate). Generate new ones with `db:generate` after editing `db/schema.ts`. Additive-only — never delete/rename columns. Do NOT use `drizzle-kit push` — destructive, doesn't track applied migrations (deprecated in Phase 19)

## Docs

- [docs/progress.md](docs/progress.md) — current progress tracker
- [docs/design-plan.md](docs/design-plan.md) — app design and build phases
- [docs/lessons.md](docs/lessons.md) — corrections and patterns to avoid repeating
