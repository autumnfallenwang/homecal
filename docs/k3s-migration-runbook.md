# HomeCal k3s migration — runbook

Step-by-step cutover from docker-compose to the home k3s cluster. Run this end-to-end on cutover day. Designed to be followed top-to-bottom; each block has exact commands and an expected outcome. See [phase19-k3s-migration-memo.md](phase19-k3s-migration-memo.md) for design rationale.

**Cluster node IP** (per `~/agentic/homenews/docs/k3s-migration/02-K3S_REFERENCE.md`): `192.168.1.163`
**Hold the rollback window**: keep `deploy/compose.yaml`, `deploy/homecal` CLI, and the pg_dump file for **7 days** post-cutover.

---

## 0. Pre-cutover checklist (before touching anything)

```
[ ] D2 done — ARCH_INFRA_TOKEN repo secret exists at github.com/autumnfallenwang/homecal/settings/secrets/actions
[ ] D2 done — first GHA build green at github.com/autumnfallenwang/homecal/actions
[ ] D2 done — both ghcr.io/autumnfallenwang/homecal-{api,web} packages flipped to public
[ ] F1 done — homecal-secrets Secret exists in cluster (see § F1 below)
[ ] E1 done — apps/homecal.yaml committed + pushed to arch-infra
[ ] DNS — homecal.arch.local + homecal-api.arch.local resolve on the workstation (`getent hosts homecal.arch.local`)
[ ] Source DB row counts recorded (G1 baseline)
[ ] All workstation tabs/sessions logged out (cookie domain changes; old sessions become invalid)
```

If any of these are unchecked, stop and complete them first.

---

## F1 — Create cluster Secret (only if not already done)

```bash
cp deploy/cluster-secrets.env.example cluster-secrets.env
$EDITOR cluster-secrets.env   # fill in DATABASE_URL, BETTER_AUTH_SECRET, POSTGRES_PASSWORD (required); EMAIL_PASSWORD + APNS_PRIVATE_KEY (optional)
bash scripts/create-cluster-secret.sh
```

**Expected**: `Created/updated homecal/homecal-secrets` followed by a list of keys.

**Verify**:

```bash
kubectl -n homecal get secret homecal-secrets -o jsonpath='{.data}' | jq 'keys'
# Expect: ["BETTER_AUTH_SECRET", "DATABASE_URL", "POSTGRES_PASSWORD", ...]
```

---

## E1 — Commit arch-infra entry (only if not already done)

The file is already written at `~/github/arch-infra/apps/homecal.yaml`. Only commit AFTER first GHA build is green and GHCR packages are public:

```bash
cd ~/github/arch-infra
git status apps/homecal.yaml   # should show "Untracked"
git add apps/homecal.yaml
git commit -m "homecal: add Application CR"
git push
```

Force Argo CD to pick it up now:

```bash
kubectl annotate app root -n argocd argocd.argoproj.io/refresh=normal --overwrite
```

**Expected**: Argo CD creates the `homecal` namespace + StatefulSet + 2 Deployments + 3 Services + 2 Ingresses within ~30s. Pods start pulling images from GHCR.

---

## G1 — Source DB baseline

Record the row counts BEFORE quiescing so we can compare after restore:

```bash
for t in accounts apikeys device_tokens event_assignees event_logs event_reminders events series sessions users verifications; do
  printf "%-20s " "$t"
  docker exec homecal-db-prod psql -U homecal -d homecal_prod -tA -c "SELECT count(*) FROM $t"
done | tee /tmp/homecal-row-counts-before.txt
```

**Expected** (current baseline at planning time — your counts may differ):

```
accounts             4
apikeys              0
device_tokens        0
event_assignees      353
event_logs           266
event_reminders      142
events               124
series               4
sessions             9
users                4
verifications        0
```

Save the file — § G6 compares against it.

Dry-run a dump to verify pg_dump works:

```bash
docker exec homecal-db-prod pg_dump -U homecal -Fc homecal_prod > /tmp/homecal-dryrun.dump
pg_restore --list /tmp/homecal-dryrun.dump | head -20
```

**Expected**: header + ~50+ items (tables, indexes, constraints, FK).

---

## G2 — Quiesce source

Stop the api + web containers so nothing writes during the dump. Leave the DB up.

```bash
docker stop homecal-api homecal-web
```

Confirm no other writer is connected:

```bash
docker exec homecal-db-prod psql -U homecal -d homecal_prod \
  -c "SELECT pid, usename, application_name, state FROM pg_stat_activity WHERE datname='homecal_prod' AND state='active'"
```

**Expected**: zero rows besides the psql session itself.

---

## G3 — Final pg_dump

```bash
DUMP=/tmp/homecal-cutover-$(date +%Y%m%d-%H%M).dump
docker exec homecal-db-prod pg_dump -U homecal -Fc homecal_prod > "$DUMP"
ls -lh "$DUMP"
pg_restore --list "$DUMP" | head -20
```

**Expected**: file size ~ few MB. List shows the same 11 tables + indexes as G1.

**Keep this file** in `/tmp/` for the 7-day rollback window.

---

## G4 — Cluster DB pre-flight + clean target

```bash
kubectl -n homecal get pod homecal-db-0 -o jsonpath='{.status.phase}'   # → Running
kubectl -n homecal exec homecal-db-0 -- pg_isready -U homecal -d homecal_prod
```

initdb auto-created an empty `homecal_prod`. Drop + recreate so pg_restore lands cleanly:

```bash
kubectl -n homecal exec homecal-db-0 -- \
  psql -U homecal -d postgres -c "DROP DATABASE homecal_prod; CREATE DATABASE homecal_prod OWNER homecal;"
```

**Expected**: `DROP DATABASE` + `CREATE DATABASE` messages, no errors.

---

## G5 — Restore into cluster

```bash
kubectl -n homecal exec -i homecal-db-0 -- \
  pg_restore -U homecal -d homecal_prod --no-owner --no-acl --verbose < "$DUMP"
```

**Expected**: stderr shows progress per object. Some "errors" about role/ACL skipping are normal due to `--no-owner --no-acl`. Real errors (missing extension, missing column) are NOT expected — homecal uses only the default `plpgsql` extension and A7 verified schema parity.

---

## G6 — Verify row counts match

```bash
diff <(cat /tmp/homecal-row-counts-before.txt | awk '{print $1, $2}') \
     <(for t in accounts apikeys device_tokens event_assignees event_logs event_reminders events series sessions users verifications; do
         cnt=$(kubectl -n homecal exec homecal-db-0 -- psql -U homecal -d homecal_prod -tA -c "SELECT count(*) FROM $t")
         echo "$t $cnt"
       done)
```

**Expected**: no diff output. If counts differ, **STOP** — do not proceed to H. Investigate via `kubectl logs homecal-db-0` and the pg_restore stderr.

Spot-check one user + one event:

```bash
kubectl -n homecal exec homecal-db-0 -- psql -U homecal -d homecal_prod -c \
  "SELECT id, name, email, role FROM users WHERE name='Aaron'"
kubectl -n homecal exec homecal-db-0 -- psql -U homecal -d homecal_prod -c \
  "SELECT id, title, start FROM events ORDER BY \"createdAt\" DESC LIMIT 1"
```

---

## G7 — Bootstrap `__drizzle_migrations` table

Source DB has no migrations table (schema came from `drizzle-kit push`). After restore the cluster DB also lacks it. Bootstrap so future `drizzle-kit migrate` runs don't try to re-apply the 11 existing migrations.

Port-forward the cluster DB to localhost for the bootstrap script:

```bash
# In one shell:
kubectl -n homecal port-forward statefulset/homecal-db 55432:5432

# In another shell:
DATABASE_URL='postgres://homecal:<password>@localhost:55432/homecal_prod' \
  pnpm --filter @homecal/api exec tsx scripts/bootstrap-drizzle-migrations.ts
```

Replace `<password>` with the value from your `cluster-secrets.env`.

**Expected**: 11 `bootstrap` lines (one per migration), no errors. Stop the port-forward when done (Ctrl+C).

Verify:

```bash
kubectl -n homecal exec homecal-db-0 -- \
  psql -U homecal -d homecal_prod -c "SELECT count(*) FROM drizzle.__drizzle_migrations"
# Expect: 11
```

Now safe to flip `migrate.enabled=true` in arch-infra's `apps/homecal.yaml` — future schema bumps run via the Helm hook.

---

## G8 — Verify password alignment

pg_dump doesn't carry role passwords (homenews lesson). Confirm the cluster's `homecal` DB user password matches what the api pod will use:

```bash
# Should succeed if passwords match:
PG_PW=$(kubectl -n homecal get secret homecal-secrets -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)
kubectl -n homecal exec homecal-db-0 -- env PGPASSWORD="$PG_PW" \
  psql -U homecal -d homecal_prod -h localhost -c '\dt' | head -5
```

If `password authentication failed`:

```bash
kubectl -n homecal exec homecal-db-0 -- \
  psql -U postgres -c "ALTER USER homecal WITH PASSWORD '$PG_PW'"
```

(POSTGRES_PASSWORD was set during F1; this only happens if the cluster's initdb ran with a different password than what's in the Secret.)

---

## H1 — DNS pre-flight

```bash
getent hosts homecal.arch.local
getent hosts homecal-api.arch.local
# Both should resolve to 192.168.1.163 (the cluster node).
```

If they don't resolve, add to `/etc/hosts` on the workstation:

```bash
echo "192.168.1.163  homecal.arch.local homecal-api.arch.local" | sudo tee -a /etc/hosts
```

(If you have router-level DNS for `*.arch.local`, it's already handled.)

---

## H2 — Cluster pre-flight

```bash
kubectl -n homecal get pod
# Expect: homecal-db-0, homecal-api-<hash>, homecal-web-<hash> all 1/1 Running

kubectl -n homecal rollout status deploy/homecal-api
kubectl -n homecal rollout status deploy/homecal-web

curl -fsS http://homecal-api.arch.local/health
# Expect: {"status":"ok"}

curl -sS -o /dev/null -w "homecal web → HTTP %{http_code}\n" http://homecal.arch.local/
# Expect: HTTP 200

# Argo CD status
kubectl -n argocd get app homecal -o jsonpath='{.status.sync.status}/{.status.health.status}'
# Expect: Synced/Healthy
```

---

## H3 — Stop docker-compose DB (final cutover step)

```bash
docker stop homecal-db-prod
ss -tlnp | grep ':51432' && echo "WARN: port still bound" || echo "OK: 51432 freed"
```

**Note**: iOS app **stops working here** — it's pointed at `192.168.1.163:51001` via `LocalConfig.swift`. Updating iOS is a separate follow-up.

---

## H4 — Smoke test: auth + events + holidays

Open `http://homecal.arch.local` in a browser.

1. Login page renders.
2. Sign in as Aaron (existing credentials — passwords survived restore).
3. Expect: re-login was required because cookie domain changed from `192.168.1.163` → `homecal.arch.local`. The 9 prior sessions are now invalid; that's expected.
4. Calendar should show **~124 existing events** across the recent date range with correct assignees + colors.
5. Open an event with reminders → activity log + reminders render.
6. Holidays show as Fraunces italic kicker lines above date numerals (if user has country set).
7. Create a new test event with all fields + 2 assignees + a 5-minute email reminder → save → appears in grid.
8. Edit it (change title) → save → activity log shows the diff.
9. Delete it → confirmation → removed from grid.
10. No console errors in browser devtools.

Quick API spot-check via curl (use a session cookie from the browser):

```bash
COOKIE=<from devtools>
curl -sS -H "Cookie: better-auth.session_token=$COOKIE" \
  http://homecal-api.arch.local/api/v1/users | jq .
```

---

## H5 — Smoke test: reminder pipeline (email)

Create an event 3 minutes in the future with an **email reminder set to 1 minute before**. Wait.

Tail logs:

```bash
kubectl -n homecal logs -f deploy/homecal-api | grep -E 'reminder|http.request'
```

**Expected at the 2-minute mark**:

```json
{"level":"info","event":"reminder.dispatch.email","reminder_id":"...","event_id":"..."}
```

Plus an email arriving at the assignee's address. Confirm `sent_at` was stamped:

```bash
kubectl -n homecal exec homecal-db-0 -- psql -U homecal -d homecal_prod -c \
  "SELECT id, \"sentAt\" FROM event_reminders WHERE \"sentAt\" IS NOT NULL ORDER BY \"sentAt\" DESC LIMIT 5"
```

**Push (APNs) test** is deferred — iOS app needs `LocalConfig.swift` updated first (out-of-scope).

---

## H6 — Loki structured-query verification

```bash
# Open Grafana → Explore → Loki, run:
{namespace="homecal"} | json | level="info"
# Expect: request-log entries with req_id, method, path, status, latency_ms.

{namespace="homecal", service="homecal-api"} | json | event="reminder.dispatch.email"
# Expect: the H5 dispatch line.

{namespace="homecal", service="homecal-api"} | json | event="server.start"
# Expect: one line per pod boot since cutover.
```

Or via curl:

```bash
curl -sG http://loki.arch.local/loki/api/v1/query_range \
  --data-urlencode 'query={namespace="homecal", service="homecal-api"} | json | event="http.request"' \
  --data-urlencode "start=$(date -u -d '-5 min' +%s)000000000" \
  --data-urlencode "end=$(date -u +%s)000000000" | jq '.data.result | length'
# Expect: > 0 (browser smoke tests generated traffic).
```

---

## H7 — Rate limiter + 4xx logging

```bash
# Hit /api/v1/users 150 times rapid-fire (default limit is 600/min, but 150 in <1s
# usually triggers per-second burst limit when key is anon).
for i in $(seq 1 150); do
  curl -sS -o /dev/null -w "%{http_code}\n" http://homecal-api.arch.local/api/v1/users
done | sort | uniq -c
# Expect: a mix of 401s (no auth) and 429s once rate limit kicks in.
```

Verify 429s logged:

```bash
kubectl -n homecal logs deploy/homecal-api --tail=200 | grep -E '"status":429'
```

---

## H8 — Smart Input → llmgw connectivity

```bash
# Verify cross-namespace DNS works from inside the api pod:
kubectl -n homecal exec deploy/homecal-api -- wget -qO- --timeout=5 http://llmgw.llmgw/ | head -c 200
# Expect: some response (200 OK or a JSON body).
```

Then from the UI: open homecal.arch.local → Quick Add (the `+` button) → text input "dentist appointment tomorrow at 3pm" → expect event form pre-fills with parsed title + ISO times.

Logs:

```bash
kubectl -n homecal logs deploy/homecal-api | grep -E 'parse|llm'
```

---

## Out of scope (mirror of memo)

These were deliberately deferred — don't try to do them as part of this cutover:

- **iOS LocalConfig.swift update** — separate follow-up; iOS app is broken post-cutover until then.
- **Sealed Secrets bootstrap** — `homecal-secrets` stays as a plain k8s Secret; swap is a no-downtime change later.
- **Grafana dashboards for homecal** — Loki queries via Explore suffice for now.
- **PVC backups** — same parity as docker volume (none).
- **APNs E2E push test** — needs iOS device on the new URL.
- **HPA / multi-replica** — single-host cluster, reminder-scheduler singleton.
- **`homecal` CLI deprecation** — keep for the 7-day rollback window, retire in I1.

---

## Rollback procedure

If the cluster cutover fails at any point in H4–H8 and you need to fall back to compose:

```bash
# 1. Bring compose back up — DB volume + all data intact since we only stopped, never deleted.
cd ~/agentic/homecal
homecal start
# (or: docker compose -f deploy/compose.yaml up -d)

# 2. Verify the old URLs work:
curl -sS http://192.168.1.163:51001/health
curl -sS -o /dev/null -w "%{http_code}\n" http://192.168.1.163:51000/

# 3. The cluster keeps running but no traffic hits it. Leave Argo CD as-is — it'll
#    self-heal whatever you point at it next. If you want it OFF entirely:
kubectl -n argocd patch app homecal --type=merge \
  -p '{"spec":{"syncPolicy":{"automated":null}}}'
kubectl -n homecal scale deploy/homecal-api --replicas=0
kubectl -n homecal scale deploy/homecal-web --replicas=0
kubectl -n homecal scale statefulset/homecal-db --replicas=0
```

### If the cluster DB was corrupted mid-restore

```bash
# Drop + recreate target, then re-restore from the same dump file.
kubectl -n homecal exec homecal-db-0 -- \
  psql -U homecal -d postgres -c "DROP DATABASE homecal_prod; CREATE DATABASE homecal_prod OWNER homecal;"
kubectl -n homecal exec -i homecal-db-0 -- \
  pg_restore -U homecal -d homecal_prod --no-owner --no-acl < "$DUMP"
# Re-run G7 bootstrap.
```

### Hold the dump file

Keep `/tmp/homecal-cutover-*.dump` for **7 days**. After that, if the cluster has been stable, it's safe to delete + remove `deploy/compose.yaml` per task I1.
