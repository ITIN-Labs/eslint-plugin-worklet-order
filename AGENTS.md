# Notes for coding agents

This is for AI coding agents working in this repository. It follows [CONTRIBUTING.md](CONTRIBUTING.md); where the two differ, CONTRIBUTING.md is right.

## Commands

```sh
npm ci
npm test            # tests with coverage
npm run lint        # ESLint and Prettier
npm run typecheck   # tsc, including the type tests
npm run build && npm run check:package
```

Run all of them before handing a change back. CI runs the same ones.

## Layout

- `src/rule.ts`: the `no-capture-before-define` rule. `src/index.ts` exports the plugin and its recommended config.
- `test/cases.ts`: shared valid and invalid cases. `test/rule.test.ts` runs them through ESLint's RuleTester; `test/differential.test.ts` checks the same cases against the real worklets Babel plugin.
- `docs/rules/no-capture-before-define.md`: the rule's documentation. Keep it in step with the rule.
- `docs/architecture.md` and `docs/security.md`: how it works and the threat model.

## Rules

- Make the smallest change that fully solves the task. No options, files or abstractions for a need that hasn't shown up.
- Don't change the public API (exports, options, error codes) or add a runtime dependency unless the task is exactly that.
- No network access, telemetry or install scripts.
- Anything with a branch, a loop or a parser gets a test, including the failure path. Use made-up data only.
- If users will notice the change, add a changeset (`npm run changeset`).
- The rule follows what the worklets Babel plugin actually does. When the two disagree, add the case to `test/cases.ts` and let the differential test decide, rather than reasoning from memory.
- Write docs, comments, test names, error messages and commit messages the way the "Writing" section of CONTRIBUTING.md asks. Commit messages carry no tool attribution.

## Never commit

- working notes: `notes/`, `PROGRESS.md`, `TODO.md`, `PLAN.md`, `HANDOFF.md`, `SESSION*.md`
- personal tool settings: `CLAUDE.local.md`, `.claude/settings.local.json`
- `.env` files, keys, tokens, or an `.npmrc` with credentials
- build output, coverage and `node_modules`

Stage files by path and check `git status` before committing. CI fails if an ignored file is tracked.
