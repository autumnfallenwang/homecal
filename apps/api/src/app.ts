import { Hono } from "hono";
import { cors } from "hono/cors";

export const app = new Hono();

app.use("/*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));
