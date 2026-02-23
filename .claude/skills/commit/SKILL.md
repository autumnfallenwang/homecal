---
name: commit
description: Git commit with conventional format
---

Before committing:
1. Run `pnpm lint` - abort if errors
2. Run `pnpm test:fast` - abort if failures
3. Stage changed files with `git add` (specific files, not -A)
4. Commit with message: `$ARGUMENTS`
5. Push to remote with `git push`

Message must use conventional commits: feat:, fix:, refactor:, docs:, test:, chore:

Append `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` to commit body.
