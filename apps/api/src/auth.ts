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
    // Let a signed-in user change their own email from Account settings. Emails
    // here are unverified (no signup verification), and `updateEmailWithoutVerification`
    // makes Better Auth apply the change directly for unverified accounts (see
    // better-auth update-user.mjs change-email handler) — no confirmation email.
    // Without this flag it falls through to requiring an email-verification setup.
    // Add `sendChangeEmailVerification` if a confirm step is ever wanted. Admins
    // change others' emails via the admin plugin, which bypasses this flow.
    changeEmail: { enabled: true, updateEmailWithoutVerification: true },
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
    // Phase 19 — k3s cutover uses two ingresses: homecal.arch.local (web) +
    // homecal-api.arch.local (api). Better Auth client (auth-client.ts) calls
    // /api/auth/* directly against the API host, so the session cookie defaults
    // to that subdomain — and isn't sent when the browser hits the web host
    // for /api/events etc. Setting Domain=.arch.local makes the cookie travel
    // to both subdomains. LAN-only cluster; no cross-tenant concern.
    //
    // Only applied when COOKIE_DOMAIN is set (the chart sets it to .arch.local in
    // the cluster). In local dev it's unset, so cookies stay host-scoped to
    // localhost — a Domain=.arch.local cookie is invalid for localhost and the
    // browser silently drops it, which looks like "sign-in 200 then 401 on every
    // protected request".
    ...(process.env.COOKIE_DOMAIN?.trim()
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: process.env.COOKIE_DOMAIN.trim(),
          },
        }
      : {}),
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
