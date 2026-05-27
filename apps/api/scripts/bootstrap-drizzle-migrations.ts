#!/usr/bin/env tsx
// Phase 19 / Task G7: bootstrap the __drizzle_migrations table against a DB
// whose schema was created via `drizzle-kit push` (not `migrate`), so the
// migrations table doesn't exist or is empty.
//
// What it does:
//   1. CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (...)
//   2. For each entry in apps/api/drizzle/meta/_journal.json, computes the
//      same hash drizzle-kit migrate uses (SHA-256 of the SQL file content)
//      and INSERTs a row marking that migration as already-applied.
//
// After this, `pnpm db:migrate` is a no-op against the current state. Any
// NEW migration files added later apply normally.
//
// Usage (against the cluster DB, post-restore):
//   kubectl -n homecal cp scripts/bootstrap-drizzle-migrations.ts homecal-db-0:/tmp/  # (optional)
//   # or just run locally with the cluster DB exposed:
//   DATABASE_URL='postgres://homecal:<password>@<host>:<port>/homecal_prod' \
//     pnpm --filter @homecal/api exec tsx ../../scripts/bootstrap-drizzle-migrations.ts
//
// For the actual cutover, the runbook uses kubectl port-forward to reach
// homecal-db-0 from the workstation, then runs this script.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DRIZZLE_DIR = path.resolve(import.meta.dirname, "../drizzle");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL env required");
  process.exit(1);
}

const journal: Journal = JSON.parse(
  readFileSync(path.join(DRIZZLE_DIR, "meta", "_journal.json"), "utf-8"),
);

const sql = postgres(dbUrl);

await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
await sql`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )
`;

const existing = await sql<{ hash: string }[]>`
  SELECT hash FROM drizzle.__drizzle_migrations
`;
const known = new Set(existing.map((r) => r.hash));

for (const entry of journal.entries) {
  const sqlPath = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
  const content = readFileSync(sqlPath, "utf-8");
  const hash = createHash("sha256").update(content).digest("hex");

  if (known.has(hash)) {
    console.log(`skip  ${entry.tag} (already in __drizzle_migrations)`);
    continue;
  }

  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${entry.when})
  `;
  console.log(`bootstrap  ${entry.tag}  hash=${hash.slice(0, 12)}…  when=${entry.when}`);
}

console.log(`\nDone. ${journal.entries.length} migrations registered.`);
await sql.end();
