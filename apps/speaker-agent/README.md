# HomeCal speaker agent

Runs in Termux on an old Android phone and turns it into a homecal speaker
(Phases 24–26, see `docs/design-plan.md` and `docs/speaker-poc-memo.md`).

- `agent.py` — the agent. Python standard library only. Every poll it POSTs a
  report to `/api/v1/agent/sync` and gets its desired state back; it rings
  scheduled wake-ups and reminders from its on-disk copy, so they fire with the
  cluster down. No listener on the phone.
- `releases/agent-<version>.py` — frozen releases, bundled into the API image
  and served at `/api/v1/agent/releases/<version>`. A device runs its pinned
  version or the latest. Cut one with `pnpm --filter @homecal/speaker-agent release`
  after bumping `VERSION`.
- `sounds/` — built-in tones served to the phone (`tools/make_sounds.py`). The
  agent generates the same bytes as an offline fallback.
- `phone/run.sh` — supervisor loop, with rollback if a new release keeps
  crashing on start. `phone/boot.sh` — Termux:Boot script, also re-run every
  15 min by a `termux-job-scheduler` watchdog.
- `tools/install.sh <phone-ip> <server-url> <key-file>` — install over SSH.

Tests: `pnpm --filter @homecal/speaker-agent test`.
