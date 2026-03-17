# Claude Code Setup — Questions & Tracking

Track automation recommendations from the `claude-code-setup` plugin for the HomeCal project.

**Created**: 2026-03-16
**Status**: Complete

---

## Implementation Levels (workflow-first approach)

Tools should be added bottom-up. Complete each level before moving to the next.

| Level | What | Status | Items |
|-------|------|--------|-------|
| 1 | **Workflow** (the dev loop) | Done | Annotation cycle ✓, recovery strategy ✓, lessons.md ✓ |
| 2 | **Docs** (shared state) | Done | CLAUDE.md ✓, design-plan ✓, progress ✓, lessons.md ✓ |
| 3 | **Skills** (workflow verbs) | Done | dev-task ✓ (upgraded), check ✓, commit ✓, update-progress ✓, all descriptions improved |
| 4 | **Guardrails** (hooks) | Done | Biome auto-format ✓, SwiftLint auto-fix ✓, block .env ✓ |
| 5 | **Capabilities** (MCP/subagents) | Done | context7 plugin ✓, github plugin ✓, code-simplifier plugin ✓, security-reviewer agent ✓, test-writer agent ✓ |

### Level 1: Workflow Improvements

| # | Improvement | Status | Description |
|---|------------|--------|-------------|
| 1a | Annotation cycle in /dev-task | Done | 2 rounds of plan review before coding |
| 1b | Recovery strategy in /dev-task | Done | Lint auto-fix → type/test fix → retry (max 3) → hand off |
| 1c | Add lessons.md | Done | Created docs/lessons.md + added to CLAUDE.md + /dev-task reads it |
| 1d | Skill descriptions improved | Done | All 6 skills have pushy, trigger-friendly descriptions |

---

## What's Installed

### Plugins
- **context7** — live documentation for Hono, Drizzle, Next.js, Better Auth, Radix UI
- **github** — GitHub issues, PRs, actions integration
- **code-simplifier** — review code for reuse, quality, efficiency
- **typescript-lsp** — TypeScript language server
- **swift-lsp** — Swift language server
- **skill-creator** — create and improve skills
- **claude-code-setup** — automation recommendations
- **superpowers** — advanced workflow skills

### Hooks (`.claude/settings.json`)
- **PreToolUse**: Block `.env` file edits
- **PostToolUse**: Auto-format TS/JS files (Biome) and Swift files (SwiftLint) on Edit/Write

### Subagents (`.claude/agents/`)
- **security-reviewer** — auth, API, iOS security audits
- **test-writer** — generate Vitest (TS) and Swift Testing tests

### Future additions (add when needed)
- **Playwright MCP** — when UI testing becomes a priority
- **create-migration skill** — when Drizzle migrations become frequent
- **new-component skill** — when building out the component library

---

## Changelog

| Date | Question # | Change |
|------|-----------|--------|
| 2026-03-16 | — | Created tracking document |
| 2026-03-16 | 1 | Completed full codebase scan with recommendations |
| 2026-03-16 | — | Added implementation levels framework (workflow-first approach) |
| 2026-03-17 | 1a-1d | Level 1 complete: annotation cycle, recovery, lessons.md, skill descriptions |
| 2026-03-17 | 3 | Skills updated for multi-platform: /lint, /test, /check, /dev-task now support both TS + Swift |
| 2026-03-17 | 4 | Level 4 complete: hooks for auto-format (Biome + SwiftLint) and block .env edits |
| 2026-03-17 | 5 | Level 5 complete: context7 + github + code-simplifier plugins, security-reviewer + test-writer agents |
