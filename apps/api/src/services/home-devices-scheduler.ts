/**
 * Household-devices scheduler (Phases 23–26), on the same 60 s cadence as the
 * reminder and digest schedulers. Each tick re-derives state from the database,
 * so a restart never loses an alert that should have gone out.
 */

import { log } from "../lib/logger.js";
import { checkDeviceHealth, type DeviceAlertFns } from "./device-health.js";
import { checkRoutineAlerts } from "./routines.js";

/** One tick. Returns how many alerts went out, for tests and logs. */
export async function runHomeDevicesTick(fns?: DeviceAlertFns): Promise<number> {
  const health = await checkDeviceHealth(fns);
  const routineAlerts = await checkRoutineAlerts(fns);
  return health + routineAlerts;
}

export function startHomeDevicesScheduler(intervalMs = 60000): NodeJS.Timeout {
  log.info(
    { event: "home_devices.scheduler.start", interval_ms: intervalMs },
    "home devices scheduler started",
  );
  const tick = () =>
    runHomeDevicesTick().catch((err) =>
      log.error({ event: "home_devices.scheduler.error", err }, "home devices tick failed"),
    );
  void tick();
  return setInterval(tick, intervalMs);
}
