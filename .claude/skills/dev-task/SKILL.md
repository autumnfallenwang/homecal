---
name: dev-task
description: Plan and implement the next development task
---

Pick up the next task from the development plan and implement it.

## Phase 1: Understand current state

1. Read `docs/progress.md` to see what's done, what's partial, what's next, and the full task plan.
2. Read `docs/design-plan.md` for design decisions and architectural context.
3. Identify the next task to work on — follow the dependency chain (earlier tasks must be done before later ones).
4. If $ARGUMENTS is provided, treat it as the specific task to work on (e.g. "task 5" or "users endpoint") instead of auto-detecting.

## Phase 2: Explore and plan

5. Read all source files relevant to the next task:
   - Files the task will create or modify
   - Files the task depends on (imports, types, existing patterns)
   - Existing test files to understand testing conventions
6. If the task involves external libraries (Hono, Drizzle, Better Auth, Zod), check type definitions in `node_modules/` to understand exact APIs.
7. Check the reference docs in `docs/` for any relevant specs.
8. Enter plan mode and write a detailed implementation plan that includes:
   - Files to create/modify (with exact paths)
   - Types and interfaces to define
   - Functions to implement (with signatures and key logic)
   - Tests to write (with test names and what they verify)
   - Changes to existing files (imports, wiring)

## Phase 3: Implement (after plan approval)

9. Create/modify files according to the approved plan.
10. Run `/lint fix` to auto-fix formatting.

## Phase 4: Verify → `/check all`

11. Run `/check all`. Abort and fix if anything fails.

## Phase 5: Update progress → `/update-progress`

12. Run `/update-progress` to update docs with new task status.
