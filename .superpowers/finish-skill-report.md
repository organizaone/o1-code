# Report: bundled `/finish` skill

Branch `finish-skill`. Nothing staged, committed or stashed.

## Files

- `packages/core/src/skills/bundled/finish/SKILL.md` (new): frontmatter `name: finish`, description
  (usage `/finish`, `/finish --fix`, `/finish --full`; "It stops before the commit and offers
  /commit"), `argument-hint: '[--fix] [--full]'`, `allowedTools: run_shell_command, read_file,
grep_search, glob, edit, write_file`. Body: Step 0 ground rules (plus how the arguments are read),
  Step 1 commands, Step 2 reach, Step 3 build/lint/typecheck/tests with `--fix` and `--full`,
  Step 4 docs, Step 5 version, Step 6 report, then a Guardrails section.
- `packages/core/src/skills/bundled/finish/SKILL.test.ts` (new): 12 tests, same shape as the
  `/commit` test.
- `docs/users/features/commands.md`: one `/finish` row in the Built-in Skills table.
- `CHANGELOG.md`: the brief's bullet under `## [Unreleased]` → `### Agent`.
- `docs/guides/TASK-COMPLETION.md`: unchanged, as the brief says.

No wiring: bundled skills are discovered by directory, and `dist/bundled/finish/SKILL.md` appears
after `npm run bundle` (no `.ts` copied).

## Deviations from the brief

1. **`ask_user_question` is not in `allowedTools`.** Same reason as `/commit`: every entry becomes a
   session-wide allow rule, which would override the question's `ask` default and answer it with no
   dialog. The brief's "never auto-approved" is only achievable by leaving it out. A test pins that it
   is absent and still evaluates to `ask` after the grant (real `PermissionManager`). The body still
   uses `ask_user_question` for the unknown-command question and the full-suite question.
2. **Headless fallbacks added**: if a question cannot be asked, Step 1 runs what is known and reports
   the rest as not run; Step 3 does not run the full suite.
3. Additions the brief implies: "If nothing changed, say so and stop" (Step 2); the no-commits-yet
   case uses `git status` alone; a missing lint/typecheck is "skipped and reported, not invented";
   under `--fix`, Step 4 also corrects the stale doc places it found; a failure without `--fix` goes
   straight to the report.

## Tests

`cd packages/core && npx vitest run src/skills/bundled/finish/SKILL.test.ts src/skills/bundled/commit/SKILL.test.ts src/skills/bundled-skills.integration.test.ts`
— 40 passed (12 new + 9 commit + 19 integration). Red first: all 12 failed with ENOENT before
`SKILL.md` existed.

## Gates (one at a time, repo root)

| Gate                                                     | Result                                         |
| -------------------------------------------------------- | ---------------------------------------------- |
| `npx prettier --check` (finish/, commands.md, CHANGELOG) | clean (test reformatted by hand with Edit)     |
| `npm run build -- --cli-only`                            | exit 0                                         |
| `npm run typecheck`                                      | exit 0                                         |
| `npm run lint`                                           | exit 0                                         |
| `node scripts/o1/brand-lint.mjs`                         | 0 lines with a forbidden name                  |
| `npm run bundle`                                         | exit 0; `dist/bundled/finish/SKILL.md` present |
| `node scripts/o1/smoke.mjs`                              | PASS                                           |

## Real run

Scratch npm project `finish-demo` (session scratchpad): `package.json` with `build`
(`node -e`), `lint` (`node --check src/sum.js`), `test` (`node --test`); `src/sum.js`, a collocated
`src/sum.test.js`, and a README saying "`sum(a, b)` adds two numbers". One commit, then `sum` edited
to `sum(...values)`. No `AGENTS.md`, no lockfile, no changelog.

`MSYS_NO_PATHCONV=1 node W:/workspace/pessoal/o1-code/dist/cli.js -p "/finish" --approval-mode yolo --output-format stream-json`
(note: with `MSYS_NO_PATHCONV=1` the script path must be a Windows path; `/w/...` fails with
MODULE_NOT_FOUND).

Tool calls, in order: `glob`, `read_file package.json`, `git status --porcelain -uall && git diff HEAD --stat && git diff HEAD`,
`npm run build`, `read_file README.md`, `read_file src/sum.test.js`, `npm run lint`,
`node --test src/sum.test.js`. Result (exit 0, 5 turns, ~23 s):

```
The commands came from `package.json` scripts run through `npm`, since there's no `AGENTS.md` or lockfile.
**Ran:**
- `npm run build`: passed (`build ok`)
- `npm run lint`: passed (`lint ok`). This lint script only syntax-checks `src/sum.js` (`node --check`).
- `node --test src/sum.test.js`: passed (1 pass, 0 fail)
**Not run:**
- Typecheck: the project doesn't declare one.
- Full suite (`npm test`): not requested, and the change doesn't affect other code.
- The test only covers `sum(2, 3)`. Nothing tests the new behaviour ...
**Docs:**
- `README.md:3` — "`sum(a, b)` adds two numbers" → `sum` now accepts any number of values, and `sum()` returns `0`.
- There's no `CHANGELOG.md`.
**Version:** not declared by this project.
**Next:** update `README.md:3` (or run `/finish --fix` to do it). ... Then run `/commit`.
```

The skill found the commands and said where from, scoped the test to the collocated file, ran the
steps in order, caught the stale README line in the required `file:line — claim → what changed`
form, and printed the fixed report shape. The working tree was unchanged afterwards (still only
` M src/sum.js`, same single commit) even in yolo mode. Raw output:
`finish-run-yolo.jsonl` in the session scratchpad.

## Open points

- `edit` and `write_file` in `allowedTools` are granted for the session on every `/finish`, not only
  under `--fix` (the brief asked for them; `simplify` does the same). Without `--fix` the body
  forbids editing, but that is an instruction, not a permission gate. Dropping them would make
  `--fix` edits go through the normal approval prompt instead; a maintainer call.
- `--fix` and `--full`, the unknown-command question and the cross-cutting full-suite question were
  not exercised in a real run (the questions need a TUI session).
- As with `/commit`, headless `-p` needs yolo or `--allowed-tools run_shell_command` for the shell.
- The model read `README.md` and the test file before running lint, i.e. it interleaved some docs
  reading with Step 3; the order of the commands themselves was respected.
