---
name: check
description: Run lint + test + type-check in sequence
---

Run all checks and report results. Stop on first failure.

1. Run `/lint`
2. `pnpm --filter @homecal/api exec tsc --noEmit`
3. Run `/test` — pass `$ARGUMENTS` through (e.g. `/check fast` → `/test fast`, `/check all` → `/test all`)

If no arguments provided, default to fast tests.
