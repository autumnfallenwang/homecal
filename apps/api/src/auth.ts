import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer } from "better-auth/plugins";
import { count } from "drizzle-orm";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
  trustedOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:3000"],
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      color: { type: "string", required: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  advanced: {
    database: {
      generateId: false, // PostgreSQL generates UUIDs
    },
  },
  plugins: [admin(), bearer()],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const [result] = await db.select({ value: count() }).from(schema.users);
          if (result.value === 0) {
            return { data: { ...user, role: "admin" } };
          }
          return { data: user };
        },
      },
    },
  },
});
