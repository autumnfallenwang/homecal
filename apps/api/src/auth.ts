import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, apiKey, bearer } from "better-auth/plugins";
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
      // Phase 17: marks a user record as a "service account" (machine caller
      // with API keys, not a family member). Set via the admin
      // /api/admin/service-accounts route; calendar /api/users filters on this.
      isService: { type: "boolean", required: false, defaultValue: false },
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
  plugins: [
    admin(),
    bearer(),
    apiKey({
      apiKeyHeaders: "x-api-key",
      defaultPrefix: "hc_",
      requireName: true,
      // Let the plugin attach a Session object when an x-api-key header is
      // present so our existing `requireAuth` middleware (which delegates to
      // `auth.api.getSession`) accepts API keys end-to-end.
      enableSessionForAPIKeys: true,
    }),
  ],
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
