import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { startReminderScheduler } from "./services/reminder-scheduler.js";

const port = Number(process.env.API_PORT) || 3001;

serve({ fetch: app.fetch, port }, (info) => {
  console.info(`homecal api running on http://localhost:${info.port}`);
  startReminderScheduler();
});
