import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { log } from "./lib/logger.js";
import { startReminderScheduler } from "./services/reminder-scheduler.js";

const port = Number(process.env.API_PORT) || 3001;

serve({ fetch: app.fetch, port }, (info) => {
  log.info({ event: "server.start", port: info.port }, "homecal api started");
  startReminderScheduler();
});
