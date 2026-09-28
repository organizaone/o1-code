# Report: bundled `/commit` skill

Branch `commit-skill`. Nothing staged, committed or stashed.

## Files

- `packages/core/src/skills/bundled/commit/SKILL.md` (new): frontmatter `name: commit`, description
  (usage `/commit`, `/commit <what changed>`, "it never pushes"), `argument-hint: '[what changed, optional]'`,
  `allowedTools: run_shell_command, read_file, grep_search, glob`. Body: Step 0 ground rules and
  guardrails (secrets, `.gitignore`, submodules), Steps 1-7 as in the brief, plus a closing
  "What changed" section for the `/commit <text>` argument.
- `packages/core/src/skills/bundled/commit/SKILL.test.ts` (new): 9 tests.
- `docs/users/features/commands.md`: one row for `/commit` in the Built-in Skills table.
- `CHANGELOG.md`: `### Agent` under `## [Unreleased]` with the bullet from the brief.

No wiring was needed: bundled skills are discovered by directory (`SkillManager`,
`bundled-skills.integration.test.ts` via `readdirSync`, `copy_bundle_assets.js` copies the whole
`bundled/` tree and drops `.ts`). No test enumerates the set of bundled skills.
`docs/users/features/skills.md` does not list bundled skills by name, so it is unchanged.

## Deviations from the brief

1. **`ask_user_question` is not in `allowedTools`.** The brief asked for it in the list, and also to
   handle it as `goal-draft` does. `allowedTools` is itself the auto-approval list: `applySkillAllowedTools`
   turns every entry into a session-wide allow rule, and an allow rule for `ask_user_question`
   overrides its `ask` default, so it would run with no dialog and return "declined" — the
   per-commit confirmation would be silently skipped. `goal-draft` leaves it out and pins that in
   its test; `/commit` does the same. The test therefore asserts the list is exactly the four
   other tools, that `ask_user_question` is absent, and (with the real `PermissionManager`) that it
   still evaluates to `ask` after the grant. The body still names `ask_user_question` for the
   grouping question and the confirmation.
2. **Instruction-file fallback is generic.** The brief's "this repository declares `<Verb> <Area>`"
   is specific to o1-code; the skill ships to other projects, so it says "use the commit format the
   project's instruction file declares (for example `AGENTS.md`), if it declares one".
3. **Headless guard added to Step 5**: if the question cannot be asked, commit nothing, print the
   proposed commits and stop. Also added: untracked files are read with `read_file` (they are not in
   `git diff HEAD`), and the no-commits-yet case.
4. `git commit -F <file>` is allowed as the temp-file form of the message.
5. Web Shell menu localization (`SKILL_DESCRIPTION_KEYS` in
   `packages/web-shell/client/constants/localCommands.ts`) was not touched, per "No i18n"; an unlisted
   skill falls back to its English description.

## Tests

`cd packages/core && npx vitest run src/skills/bundled/commit/SKILL.test.ts src/skills/bundled-skills.integration.test.ts`
— 27 passed (9 new + 18 integration). Red first: all 9 failed with ENOENT before `SKILL.md` existed.

## Gates (one at a time, repo root)

| Gate                                                     | Result                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run build -- --cli-only`                            | ok                                                             |
| `npm run typecheck`                                      | exit 0                                                         |
| `npm run lint`                                           | exit 0                                                         |
| `node scripts/o1/brand-lint.mjs`                         | 0 lines with a forbidden name                                  |
| `npx prettier --check` (SKILL.md, test, docs, CHANGELOG) | clean (test reformatted by hand with Edit)                     |
| `npm run bundle`                                         | exit 0; `dist/bundled/commit/SKILL.md` exists, no `.ts` copied |
| `node scripts/o1/smoke.mjs`                              | PASS                                                           |

## Real run

Scratch repo (one commit `Add Demo project: README and entry point`, then a README "Usage" edit and
a new `scripts/clean.sh`). The repo was unchanged after every run: no staging, no commit.

1. `node dist/cli.js -p "/commit" --approval-mode plan` from Git Bash: MSYS rewrote `/commit` into
   `C:/Users/.../git/.../commit`, so the skill did not load; the model noticed and said so. Rerun with
   `MSYS_NO_PATHCONV=1`.
2. Same, `--approval-mode plan`, with the path fixed: the skill loaded. Plan mode offers no shell, so it
   read the files, detected the style from the session's git snapshot, proposed two commits
   ("Document how to run the demo in README" / "Add clean script to remove build output") and said
   "I made no commits. Plan mode is on, this run can't ask for confirmation, and the `/commit` skill
   requires a confirmation before each commit."
3. Default mode, `-p "/commit"`: headless `-p` does not expose `run_shell_command` at all (the skill's
   grant does not add a tool that is not registered), so again no git output; the model tried a
   subagent and tool search, then proposed the same two commits and committed nothing.
4. `-p "/commit" --allowed-tools run_shell_command`: the skill ran Step 1 exactly (one shell call
   with status, diff stat, diff, `log -20 --format=%s`, `log -3 --format=%B`), read the untracked
   script, detected plain imperative English, grouped into two commits ("Add usage instructions to
   README" — README.md; "Add script to clean build output" — scripts/clean.sh), and stopped at the
   confirmation: "I didn't make any commits. This is a non-interactive run, so I couldn't get your
   approval for each commit, which this workflow requires before committing." It did not call
   `ask_user_question` to see it fail; it recognized the headless run up front.

Raw output: `commit-run-plan.jsonl`, `commit-run-default.jsonl`, `commit-run-shell.jsonl` in the
session scratchpad.

## Open points

- The interactive path (the confirmation dialog, "Edit the message" via `Other`, the actual
  `git add` / `git commit` / verify) was not exercised: it needs a TUI session.
- In headless `-p`, `/commit` can only propose unless the caller passes
  `--allowed-tools run_shell_command` (or yolo); even then it cannot confirm, so it never commits
  headless. That is by design, but the docs row does not say it.
- Git Bash users typing `o1-code -p "/commit"` hit MSYS path conversion; this affects every slash
  command in `-p`, not just this one. Possibly worth a note in `docs/users/features/headless.md`.
- A model-invoked `/commit` (the description allows model invocation) still gets the shell grant
  for the session; the confirmation dialog remains the gate before any commit.
