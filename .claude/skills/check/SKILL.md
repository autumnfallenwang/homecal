---
name: check
description: Run lint + test + type-check in sequence
---

Run all three checks and report results:

1. `pnpm lint` (biome check across all packages)
2. `pnpm --filter @homecal/api exec tsc --noEmit` (API type-check)
3. `pnpm test:fast` (unit tests only)

Stop on first failure. Report pass/fail for each step.
