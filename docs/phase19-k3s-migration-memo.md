# Phase 19 — k3s migration (web + API + DB, iOS deferred)

Move HomeCal off the single-host `docker compose` stack onto the home k3s cluster managed by `arch-infra` (Argo CD GitOps). Follows the playbook validated on llmgw (2026-05-10 → 2026-05-11) and homenews (Phase 17), with two homecal-specific shapes: **real secrets** (BETTER_AUTH_SECRET, EMAIL_PASSWORD, APNS_PRIVATE_KEY) that the LAN-only-trivial pattern from llmgw/homenews doesn't cover, and **an iOS client** that we deliberately leave broken (out-of-scope) during cutover.

This memo is the design + checklist. The cluster reference (Argo CD layout, Alloy/Loki conventions, gotchas) lives in `~/agentic/homenews/docs/k3s-migration/02-K3S_REFERENCE.md` — read it first if you haven't.

## Why now

- llmgw + homenews are both on the cluster. HomeCal is the last app on the legacy docker-compose-on-host pattern.
- HomeCal's current `LLM_GATEWAY_URL=http://localhost:51277` is already broken because llmgw migrated to the cluster — Smart Input has been silently failing in prod. Fixing it requires either reverting llmgw (no) or pointing HomeCal at the cluster's `llmgw.llmgw` Service DNS (yes).
- Observability — Loki retention rule for `homecal` namespace is already pre-provisioned in arch-infra (30-day retention). Until HomeCal lands in the cluster, that rule is dormant.

## What changes (and what doesn't)

**Unchanged:**
- App code structure, schema, reminder scheduler, Better Auth surface, Drizzle layer.
- iOS app source — *deliberately* left untouched. Post-cutover the iOS app stops working until `LocalConfig.swift` is updated separately to point at `homecal-api.arch.local`. That's a follow-up.
- Image build via `Dockerfile.api` + `Dockerfile.web`. The compose stack stays in-tree for ≥7 days post-cutover as a rollback path.

**Changed:**
- Deployment surface: docker-compose → Helm chart at `deploy/chart/` synced by Argo CD.
- Database hosting: docker container with a docker named volume → in-cluster StatefulSet with a `local-path` PVC. Data migrates via `pg_dump | pg_restore`.
- External URLs: `http://192.168.1.163:51000` / `:51001` → `http://homecal.arch.local` (web) + `http://homecal-api.arch.local` (api), routed by Traefik.
- Internal LLM gateway URL: `http://localhost:51277` → `http://llmgw.llmgw` (cross-namespace Service DNS).
- Image registry: local docker build → `ghcr.io/autumnfallenwang/homecal-{api,web}` via GHA on push to main.
- Logging: `console.log/error/info/warn` (plain text) → `pino` (JSON-per-line) + Hono `request-log` middleware emitting `req_id`/method/path/status/latency_ms. Without this, Loki queries can only regex; with this, `{namespace="homecal", service="homecal-api"} | json | level="error"` works day one.
- Drizzle workflow: `drizzle-kit push` (destructive — silently dropped users in prod historically) → `drizzle-kit migrate` driven by Helm pre-install Job, against the existing `apps/api/drizzle/*.sql` files.
- GitOps source of truth: this repo's `deploy/compose.yaml` → `arch-infra/apps/homecal.yaml` (Argo CD Application CR pointing at this repo's `deploy/chart`).

## Cluster shape (target)

```
namespace: homecal
├── statefulset/homecal-db        postgres:17-alpine (1 replica, Recreate, fsGroup 999)
│   └── pvc/homecal-db-data       5Gi local-path, /var/lib/postgresql/data
├── deployment/homecal-api        ghcr.io/autumnfallenwang/homecal-api:<sha> (1 replica, Recreate)
├── deployment/homecal-web        ghcr.io/autumnfallenwang/homecal-web:<sha> (1 replica, RollingUpdate)
├── job/homecal-migrate           Helm pre-install/pre-upgrade hook, drizzle-kit migrate (weight -5)
├── secret/homecal-secrets        BETTER_AUTH_SECRET, EMAIL_PASSWORD, APNS_PRIVATE_KEY, POSTGRES_PASSWORD (manual, not committed)
├── service/homecal-db            ClusterIP headless (clusterIP: None), port 5432 → 5432
├── service/homecal-api           ClusterIP, port 80 → 52001
├── service/homecal-web           ClusterIP, port 80 → 52000
├── ingress/homecal-web           Traefik, host homecal.arch.local       → svc/homecal-web
└── ingress/homecal-api           Traefik, host homecal-api.arch.local   → svc/homecal-api
```

Notes:
- **Two ingresses, not path-based routing.** Mirrors llmgw + homenews convention. Avoids CORS/rewrite issues with Better Auth's `/api/auth/*` paths.
- **API uses Recreate** because the reminder scheduler is a `setInterval` singleton inside the API process. Two replicas would double-fire reminders. Single replica + Recreate matches homenews.
- **Web uses RollingUpdate**, single replica (stateless).
- **DB as StatefulSet** for stable pod name (`homecal-db-0`) + VolumeClaimTemplate. Headless Service so `homecal-db:5432` resolves to the pod IP directly.

## Cross-namespace service map

| Caller | Target | URL | Why |
|---|---|---|---|
| api pod | db (same ns) | `postgres://homecal:homecal_prod@homecal-db:5432/homecal_prod` | Headless Service DNS |
| api pod | llmgw (different ns) | `http://llmgw.llmgw` | Cross-ns Service DNS, port 80 → llmgw's 51277 |
| web pod (SSR) | api (same ns) | `http://homecal-api` | Internal Service, one hop, never leaves pod net |
| browser | web | `http://homecal.arch.local` | Public Ingress |
| browser | api (Better Auth + REST) | `http://homecal-api.arch.local` | Public Ingress, baked into web build as `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_AUTH_URL` |

Pulled from homenews lesson: **in-cluster apps must use Service DNS for peer-to-peer; only browser/external clients hit ingress hostnames.** Web SSR pointing at the public ingress doesn't resolve inside the pod and silently fails — audit before cutover.

## Secrets handling

Unlike llmgw/homenews (LAN-trivial `homenews:homenews` passwords), HomeCal carries real secrets: `BETTER_AUTH_SECRET` (auth integrity), `EMAIL_PASSWORD` (Gmail app password), `APNS_PRIVATE_KEY` (Apple cert), `POSTGRES_PASSWORD` (DB auth).

**Approach for cutover**: regular `kubectl create secret generic homecal-secrets` from a local secrets file. Not committed. Deployment env wires sensitive fields via `valueFrom.secretKeyRef`, plaintext fields (URLs, model names, ports, CORS origins, SMTP server) via `env:` in `values.yaml`.

**Sealed Secrets**: deliberately deferred to a follow-up. Cluster doesn't have the operator installed yet; bundling that install into the cutover doubles the surface area. The handoff is a no-downtime env-var source change once Sealed Secrets is in place.

## Postgres password handling (critical)

`pg_dump -Fc <dbname>` does NOT carry role passwords (homenews lesson, learned the hard way). After `pg_restore`, the cluster `homecal` user keeps whatever password `initdb` set from `POSTGRES_PASSWORD` env — which may not match the source DB.

**Approach**: set the cluster's `POSTGRES_PASSWORD=homecal_prod` from the start (matches source compose value) so passwords align natively. Fallback if mismatch: `kubectl exec homecal-db-0 -- psql -U postgres -c "ALTER USER homecal WITH PASSWORD 'homecal_prod'"`.

Also relevant: **POSTGRES_DB / POSTGRES_PASSWORD are honored only at initdb time on an empty PGDATA.** Once data exists, env changes do nothing. If we ever need to rename or repassword, it's `ALTER USER` / `CREATE DATABASE`, not editing values.yaml.

## Data migration

The existing prod data lives in a docker named volume (`deploy_homecal-db-prod-data`, ~63MB, 11 tables, 4 users, 124 events, 353 assignees, 142 reminders, 266 change logs, 9 sessions). Migration path (Phase G):

```bash
# 1. Quiesce source — stop API+web, leave DB up
docker stop homecal-api homecal-web

# 2. Confirm no active queries
docker exec homecal-db-prod psql -U homecal -d homecal_prod \
  -c "SELECT pid, query FROM pg_stat_activity WHERE state='active' AND datname='homecal_prod'"

# 3. Dump
docker exec homecal-db-prod pg_dump -U homecal -Fc homecal_prod \
  > /tmp/homecal-cutover-$(date +%Y%m%d-%H%M).dump

# 4. Verify dump integrity
pg_restore --list /tmp/homecal-cutover-*.dump | head -40

# 5. Drop+recreate cluster DB (initdb auto-created it empty)
kubectl -n homecal exec homecal-db-0 -- \
  psql -U homecal -d postgres \
  -c "DROP DATABASE homecal_prod; CREATE DATABASE homecal_prod OWNER homecal;"

# 6. Restore
kubectl -n homecal exec -i homecal-db-0 -- \
  pg_restore -U homecal -d homecal_prod --no-owner --no-acl --verbose \
  < /tmp/homecal-cutover-*.dump

# 7. Verify row counts match source
for t in accounts apikeys device_tokens event_assignees event_logs \
         event_reminders events series sessions users verifications; do
  kubectl -n homecal exec homecal-db-0 -- \
    psql -U homecal -d homecal_prod -tA -c "SELECT count(*) FROM $t"
done

# 8. Bootstrap __drizzle_migrations table (source DB has no migrations table —
#    schema was created via drizzle-kit push, not migrate)
kubectl -n homecal exec homecal-db-0 -- psql -U homecal -d homecal_prod -c "
  CREATE TABLE IF NOT EXISTS public.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  );
  INSERT INTO public.__drizzle_migrations (hash, created_at) VALUES
    -- one row per existing apps/api/drizzle/0000-0004*.sql, hashes from meta/_journal.json
    ('<hash-0>', <ts-0>), ..., ('<hash-4>', <ts-4>);
"
```

**Downtime**: ~5 min for 63MB. Acceptable.

**Schema drift risk**: the running schema came from `drizzle-kit push` (no migrations table). Pre-cutover Task 90 audits whether the 5 existing `*.sql` files reproduce the running schema. If drift found, generate `0005_baseline.sql` first so the cluster's migrate-Job converges to the same state.

## Image build pipeline

Each of `homecal-api` and `homecal-web` becomes its own GHCR image: `ghcr.io/autumnfallenwang/homecal-api:<sha>` and `ghcr.io/autumnfallenwang/homecal-web:<sha>`.

GHA `build.yml` matrix-builds both images in parallel, then runs **two** `yq` rewrites in a single arch-infra commit (atomic api+web roll — required because the web build embeds `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_AUTH_URL` at build time, and the API contract evolves in lockstep):

```bash
SHA="${GITHUB_SHA}" yq -i '
  (.spec.source.helm.parameters[] | select(.name == "api.image.tag") | .value) = strenv(SHA) |
  (.spec.source.helm.parameters[] | select(.name == "web.image.tag") | .value) = strenv(SHA)
' apps/homecal.yaml
```

Gotchas from homenews's experience:
- Use `git clone https://x-access-token:${GH_TOKEN}@github.com/...` — `gh repo clone` doesn't bake the PAT into the push URL.
- Use `yq`, not `sed` — `sed` is too greedy on `tag:` lines.
- GHCR packages are private by default on first push. Manual flip to public twice (api + web) before arch-infra `Application` is committed, otherwise first sync `ImagePullBackOff`s.

## securityContext

Per homenews gotcha 4 (silent field-drop on wrong placement):

```yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000        # postgres pod overrides to 999
  runAsGroup: 1000       # postgres pod overrides to 999
  fsGroup: 1000          # postgres pod overrides to 999 for PVC ownership
containerSecurityContext:           # ← these MUST be container-level
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: false    # Next.js writes to .next/cache; api writes nothing critical
  capabilities:
    drop: [ALL]
```

`allowPrivilegeEscalation`, `readOnlyRootFilesystem`, `capabilities` at pod level are silently dropped by k8s. Split or they don't apply.

## Logging contract (Phase A)

Adopt homenews's pino + request-log pattern (the logger comment in `homenews/apps/api/src/lib/logger.ts` was explicitly written to be portable to homecal/llmgw).

**Field conventions**:
- Always present: `time`, `level`, `msg`, `service`, `version`
- `event` for categorical event names (`reminder.dispatch.email`, `http.request`)
- `*_ms` for durations, `*_count` for counts
- `err` for caught Errors (pino auto-serializes `{type, message, stack}`)
- `req_id` per HTTP request (set by `request-log` middleware, available in handlers via `c.get("req_id")`)

**Never log**: passwords, session cookies, API keys, bearer tokens, `Authorization` header contents, email body contents, family member full names alongside emails on the same line.

**Service label**: strip `@homecal/` from package name → `service="homecal-api"`. Lets Grafana queries do `{service="homecal-api"} | json | event="reminder.dispatch.email"` cleanly.

## Networking specifics

- **API → DB**: `DATABASE_URL=postgres://homecal:homecal_prod@homecal-db:5432/homecal_prod`
- **API → llmgw**: `LLM_GATEWAY_URL=http://llmgw.llmgw` (cross-ns Service DNS). No more `localhost:51277`. No more `network_mode: host`.
- **Web SSR → API**: `API_URL=http://homecal-api` (internal Service, one hop)
- **Web build → API**: `NEXT_PUBLIC_API_URL=http://homecal-api.arch.local` + `NEXT_PUBLIC_AUTH_URL=http://homecal-api.arch.local` (baked into the standalone build by GHA)
- **Browser → API**: same as above (the inlined `NEXT_PUBLIC_*` values)
- **CORS**: API `CORS_ORIGINS=http://homecal.arch.local` (only the web ingress origin; bearer tokens for non-browser callers don't need CORS)

## Out of scope (deliberately)

- **Sealed Secrets install** — tracked separately; manual `kubectl create secret` for cutover.
- **iOS LocalConfig.swift update** — separate follow-up. iOS app breaks post-cutover until then. Per user direction: "neglect iOS" for this phase.
- **Grafana dashboards for homecal** — Loki queries via Explore are sufficient for now. Dashboards deferred.
- **HPA / multi-replica** — Personal app, single-host cluster, scheduler-singleton constraint on the API.
- **PVC backups** — Same parity as today (docker volume had no backup either). Revisit when it bites.
- **APNs E2E push test** — Requires an iOS device updated to new URL. Deferred with iOS.
- **`homecal` CLI deprecation** — Keep the script for the 7-day rollback window, retire after.

## Open questions — resolved

- **Hostname pair vs single host with path routing** → two hostnames (`homecal.arch.local` + `homecal-api.arch.local`).
- **Sealed Secrets timing** → plaintext k8s Secret for cutover, Sealed Secrets later as a follow-up.
- **PVC size** → 5Gi (current data is 63MB; massive headroom).
- **iOS during cutover** → break it (out-of-scope). Update LocalConfig.swift in a separate follow-up.
- **BETTER_AUTH_URL value** → `http://homecal-api.arch.local` (Better Auth's `/api/auth/*` lives on the API host).
- **DB name** → keep `homecal_prod` (preserves the dump as-is; rename is a separate follow-up if ever needed).
- **Drizzle workflow** → switch dev + cluster to `drizzle-kit migrate` from `drizzle-kit push`. Push is the root cause of the historical orphaned-sessions/wiped-users mystery in the prod DB.

## Task list

Numbered 84+ to continue the progress.md sequence after Phase 18's 80-83.

### Phase A — App code touchups + logging hygiene + drizzle hygiene

| # | Task |
|---|------|
| 84 | A1: env-var surface audit — confirm /health, API_PORT, list every var the API reads (BETTER_AUTH_SECRET, BETTER_AUTH_URL, CORS_ORIGINS, LLM_GATEWAY_URL, LLM_MODEL, LLM_FALLBACK_MODEL, EMAIL_*, APNS_*, LOG_LEVEL) — the authoritative list for B5/B6 |
| 85 | A2: web SSR vs browser API URL split — `API_URL` for server-side fetches (Service DNS), `NEXT_PUBLIC_API_URL` for client bundle (Ingress) |
| 86 | A3: add `pino` structured logger at `apps/api/src/lib/logger.ts` (mirror homenews's contract, strip `@homecal/` scope → `service="homecal-api"`) |
| 87 | A4: add `request-log` middleware emitting `{method, path, status, latency_ms, req_id}` JSON per request |
| 88 | A5: replace 7 `console.*` call sites in API with `log.*` (index.ts startup, reminder-scheduler.ts six sites) |
| 89 | A6: plumb `LOG_LEVEL` env through values.yaml + Deployment |
| 90 | A7: schema drift audit — verify `apps/api/drizzle/0000-0004*.sql` reproduce the running schema; generate `0005_baseline.sql` if drift found |
| 91 | A8: switch dev workflow from `drizzle-kit push` to `drizzle-kit migrate`; remove `db:push` from package.json scripts |
| 92 | A9: fix existing broken `LLM_GATEWAY_URL=http://localhost:51277` in `apps/api/.env.example` + `deploy/.env.production.example` → `http://llmgw.arch.local` (dev) / `http://llmgw.llmgw` (cluster, already in B6) |

### Phase B — Helm chart at `deploy/chart/`

| # | Task |
|---|------|
| 93 | B1: scaffold `Chart.yaml`, `values.yaml` placeholder, `_helpers.tpl`, `NOTES.txt`, `.helmignore` |
| 94 | B2: `templates/statefulset-db.yaml` + `templates/service-db.yaml` (postgres:17-alpine no pgvector, headless Service, 5Gi PVC, fsGroup 999, container-level securityContext) |
| 95 | B3: `templates/deployment-api.yaml` + `templates/service-api.yaml` + `templates/ingress-api.yaml` (Recreate, /health probes, securityContext placement correct) |
| 96 | B4: `templates/deployment-web.yaml` + `templates/service-web.yaml` + `templates/ingress-web.yaml` (RollingUpdate, GET / probes) |
| 97 | B5: wire secrets via `secretKeyRef` to `homecal-secrets` (created out-of-band) for BETTER_AUTH_SECRET, EMAIL_PASSWORD, APNS_PRIVATE_KEY, POSTGRES_PASSWORD |
| 98 | B6: `values.yaml` — three blocks (api / web / db), plaintext env + image tags="latest" |
| 99 | B7: `templates/job-migrate.yaml` — Helm pre-install/pre-upgrade hook running `drizzle-kit migrate` |

### Phase C — Dockerfile hardening

| # | Task |
|---|------|
| 100 | C1: `Dockerfile.api` — add `USER node`, verify `drizzle/` directory is copied |
| 101 | C2: `Dockerfile.web` — add `USER node` on runtime stage, verify NEXT_PUBLIC_API_URL + NEXT_PUBLIC_AUTH_URL build-arg passthrough |

### Phase D — CI

| # | Task |
|---|------|
| 102 | D1: `.github/workflows/build.yml` — three jobs (test, build-and-deploy matrix, bump-arch-infra). Use `git clone https://x-access-token:${GH_TOKEN}@...` URL form, `yq` not `sed`, concurrency group serialized |
| 103 | D2: user-action — add `ARCH_INFRA_TOKEN` PAT to homecal GitHub repo secrets; after first GHA build, flip both `ghcr.io/autumnfallenwang/homecal-{api,web}` packages to public |
| 104 | D3: `.github/dependabot.yml` — npm + docker + github-actions, weekly |

### Phase E — arch-infra registration

| # | Task |
|---|------|
| 105 | E1: create `apps/homecal.yaml` in `~/github/arch-infra/` (Application CR, two image.tag params). **Commit only AFTER D2 completes** so first sync doesn't ImagePullBackOff |

### Phase F — Secrets in cluster

| # | Task |
|---|------|
| 106 | F1: `kubectl create namespace homecal` + `kubectl create secret generic homecal-secrets --from-env-file=...` with the real secret values (out-of-band, file not committed) |

### Phase R — Runbook

| # | Task |
|---|------|
| 107 | R1: write `docs/k3s-migration-runbook.md` — pre-cutover checklist, G/H exact commands, rollback procedure, out-of-scope declaration |

### Phase G — Data migration

| # | Task |
|---|------|
| 108 | G1: source DB pre-flight — record real row counts per table, dry-run dump |
| 109 | G2: quiesce source — `docker stop homecal-api homecal-web`; confirm no active queries |
| 110 | G3: final `pg_dump -Fc`, verify integrity with `pg_restore --list` |
| 111 | G4: cluster DB pre-flight — verify `homecal-db-0` Running, drop+recreate empty target DB |
| 112 | G5: `pg_restore` into cluster pod |
| 113 | G6: verify row counts match source across all 11 tables |
| 114 | G7: bootstrap `__drizzle_migrations` table with one row per existing migration file |
| 115 | G8: post-restore password alignment — verify cluster DB password matches source (or `ALTER USER` to fix) |

### Phase H — Cutover

| # | Task |
|---|------|
| 116 | H1: DNS pre-flight — `homecal.arch.local` + `homecal-api.arch.local` resolve on workstation |
| 117 | H2: cluster pre-flight — pods Running, ingress responds 200, Argo CD Synced+Healthy |
| 118 | H3: stop docker-compose DB — `docker stop homecal-db-prod` (api+web already stopped in G2) |
| 119 | H4: smoke test — sign in as Aaron, calendar shows existing events (~124), assignees + reminders + holidays render, create/edit/delete new event works |
| 120 | H5: reminder pipeline (email) — create event with 1-min reminder, verify dispatch log + email arrival |
| 121 | H6: Loki structured-query verification — `{namespace="homecal"} \| json \| level="info"` shows request-log entries |
| 122 | H7: rate limiter + 4xx logging — rapid-fire `/api/v1/users` for 429s, verify logged in Loki |
| 123 | H8: Smart Input → llmgw connectivity — `kubectl exec` reach `llmgw.llmgw`, drive Quick Add from UI |

### Phase I — Cleanup

| # | Task |
|---|------|
| 124 | I1: after 7-day stable window — remove `deploy/compose.yaml`, `deploy/homecal` CLI wrapper, update CLAUDE.md (Production section: docker → k3s), update docs/progress.md |

## Verification (post-cutover)

```bash
# 1. Pods up
kubectl get pod -n homecal
# Expect: homecal-db-0, homecal-api-<hash>, homecal-web-<hash> all 1/1 Running

# 2. Ingress smoke
curl -fsS http://homecal-api.arch.local/health
curl -fsS http://homecal.arch.local/

# 3. End-to-end auth + data
# (manual: browser → sign in → calendar shows events)

# 4. Loki proves logger contract
curl -sG http://loki.arch.local/loki/api/v1/query_range \
  --data-urlencode 'query={namespace="homecal", service="homecal-api"} | json | event="http.request"' \
  --data-urlencode "start=$(date -u -d '-5 min' +%s)000000000" \
  --data-urlencode "end=$(date -u +%s)000000000" | jq '.data.result | length'

# 5. LOG_LEVEL bump works at runtime
kubectl set env -n homecal deploy/homecal-api LOG_LEVEL=debug
kubectl rollout status -n homecal deploy/homecal-api
# trigger an action, query Loki for level="debug"
kubectl set env -n homecal deploy/homecal-api LOG_LEVEL=info

# 6. Cross-namespace LLM call
kubectl -n homecal exec deploy/homecal-api -- wget -qO- http://llmgw.llmgw/
# (manual: browser → Quick Add → parse → event pre-filled)
```

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| pg_restore succeeds, app can't connect (password mismatch) | G8 verifies + `ALTER USER` if needed; B2 sets `POSTGRES_PASSWORD=homecal_prod` from start to match natively |
| Schema drift between drizzle SQL files and running DB | A7 audit before cutover; generate 0005_baseline.sql if needed |
| Cookie domain change breaks all 9 active sessions | Expected. Users re-login. Passwords survive restore. |
| iOS app stops working post-cutover | Expected. Out-of-scope. LocalConfig.swift update is a separate follow-up. |
| First Argo CD sync ImagePullBackOffs | E1 ordering: commit arch-infra entry ONLY after D1+D2 complete and GHCR is public |
| Reminder fires during cutover get lost | Acceptable for personal app. Reminder-scheduler is at-least-once via sentAt; missed-window reminders fire late on the new pod. |
| LLM_GATEWAY_URL was already dead (Smart Input broken in current prod) | A9 fixes it pre-cutover so dev mode works again; cluster picks up the correct URL via B6 |
