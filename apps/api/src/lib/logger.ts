// Phase 19 — structured logger.
//
// Writes one JSON object per line to stdout. Alloy (k3s DaemonSet) tails pod
// stdout and forwards to Loki. The app never manages files, transports, or
// rotation. See docs/phase19-k3s-migration-memo.md for the logger contract.
//
// Field conventions:
//   - Always present: `time`, `level`, `msg`, `service`, `version`
//   - Use `event` for categorical event names (`http.request`,
//     `reminder.dispatch.email`, `reminder.dispatch.push`)
//   - Use `*_ms` for durations, `*_count` for counts
//   - Use `err` for caught Errors (pino auto-serializes {type, message, stack})
//   - Use `req_id` (set by the request-log middleware) so route handlers can
//     correlate logs across a single request via `log.child({ req_id })`
//
// LOG_LEVEL bumps verbosity at runtime — `info` in prod, `debug` for diagnosis.
// In k3s: `kubectl set env deploy/homecal-api LOG_LEVEL=debug`.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pino } from "pino";

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
  name: string;
  version: string;
};

// Strip the `@homecal/` scope so Loki sees a flat label (`homecal-api`)
// matching the homenews/llmgw convention.
const service = pkg.name.replace(/^@[^/]+\//, "homecal-");

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service, version: pkg.version },
  timestamp: pino.stdTimeFunctions.isoTime,
});
