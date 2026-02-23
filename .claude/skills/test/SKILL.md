---
name: test
description: Run Vitest test suite
---

Run tests. Show failures clearly with file and line numbers.

- No arguments: run fast tests only (`pnpm test:fast`)
- `--all` or `all`: run full suite (`pnpm test`)
- Any other arguments: pass through to vitest (`pnpm --filter @homecal/api exec vitest run $ARGUMENTS`)
