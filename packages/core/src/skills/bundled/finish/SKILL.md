---
name: finish
description: Close a unit of change in the current project - build, lint on the whole project, typecheck, the tests in the reach of the change, a documentation check and the version step when the project declares one - then report what ran and what did not. Use when the user says the work is done, asks to finish, wrap up, or verify a change before committing. Usage - /finish to check and report, /finish --fix to also fix what fails and sync the docs, /finish --full to run the full test suite as well. It stops before the commit and offers /commit.
argument-hint: '[--fix] [--full]'
allowedTools:
  - run_shell_command
  - read_file
  - grep_search
  - glob
---

# /finish — close a unit of change

You are already inside the loaded `finish` skill — do not call the `skill` tool to invoke it again; start with Step 0.

## Step 0 — ground rules

You close a unit of change: build → lint → tests → docs → version → report. You never commit: at the end, offer `/commit`. You never push, never run the full suite without being asked (by `--full` or by the user's answer in Step 3), and without `--fix` you never edit files.

Read the arguments after `/finish`: `--fix` lets you fix failures and sync documentation; `--full` runs the full test suite as the last test step. Anything else is context for the change, not a flag. Edits under `--fix` go through the normal approval of the session: the skill grants no edit tool of its own.

## Step 1 — commands

Read `AGENTS.md` at the project root and take the commands from its `## Commands` block: build, lint, typecheck, test one file, the full suite, and a version command if it declares one.

Without that block, detect the commands the way `/init` does: `package.json` scripts (`build`, `lint`, `typecheck`, `test`), run through the package manager the lockfile names (`pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, `bun.lock`/`bun.lockb` → `bun`, otherwise `npm`); `Makefile` targets; `Cargo.toml` (`cargo build`, `cargo clippy`, `cargo test`); `go.mod` (`go build ./...`, `go vet ./...`, `go test ./...`); `pyproject.toml`/`pytest.ini` (`ruff`, `mypy`, `pytest` when configured). A missing lint or typecheck command is skipped and reported, not invented.

If the build or the test command is still unknown, ask once with `ask_user_question`, offering the candidates you found. If the question cannot be asked (headless, or the tool refuses), run what is known and report the rest as not run.

Say which source the commands came from (`AGENTS.md`, `package.json`, …).

## Step 2 — reach of the change

Run `git status --porcelain -uall` and `git diff HEAD --stat` to list the changed files (in a repository with no commits yet, `git status` alone). If nothing changed, say so and stop.

The tests in scope are:

- for each changed source file, the tests next to it: `x.test.*`, `x.spec.*`, `__tests__/x.*`;
- each changed test file itself;
- for a changed shared module — one imported by many files; check with `grep_search` for its import path — the tests of its importers.

A change to test configuration, fixtures, design tokens or a base component is cross-cutting: the scope becomes the suite of its package, and the full suite is proposed, not run.

## Step 3 — build, lint, typecheck, tests

Run, each with the declared command and in this order:

1. **Build**.
2. **lint on the whole project**, not only on the changed files.
3. **typecheck**, when the project declares one.
4. The **scoped tests** from Step 2, with the test-one-file command (or the package suite for a cross-cutting change).

Without `--fix`, a failure stops the cycle: report the command, the decisive lines of its output (not the whole log), and stop — go straight to Step 6.

With `--fix`, fix the cause and restart from the build: fix the code, never the assertion to silence it, never `--no-verify`, never skipping a test. Allow at most two restarts; if something still fails, stop and report what is left.

With `--full`, run the full suite as the last test step without asking. Without `--full`, when the change is cross-cutting, ask once with `ask_user_question` whether to run the full suite (if the question cannot be asked, do not run it); otherwise say the full suite was not run.

## Step 4 — docs

From the diff, list what a user or a developer could notice: a new or changed command, flag, setting, environment variable, config key, route, file format, behaviour or error message.

For each, `grep_search` the docs (`README.md`, `docs/`, `AGENTS.md`, `CHANGELOG.md`) for the old and the new name, and report each place that still describes the old behaviour as `file:line — claim → what changed`. Under `--fix`, correct those places.

When the repository keeps a changelog with an `## [Unreleased]` heading and the change is user-visible, check that an entry for it exists there; if not, say so, and under `--fix` add a one-line entry in the changelog's existing style.

Never create a new documentation file. If nothing documented is touched, say "docs: nothing to sync".

## Step 5 — version

Only when `AGENTS.md` declares a version command: say which bump the change implies — patch for a fix or an internal change, minor for a new capability, major for a breaking one — and, under `--fix`, run the declared command. Otherwise state "version: not declared by this project" and move on.

Never edit version files by hand.

## Step 6 — report

Report in this fixed shape, short, with the decisive output lines rather than whole logs:

- `Ran:` one line per command, with its result.
- `Not run:` the full suite, anything skipped, and why.
- `Docs:` the findings, or "nothing to sync".
- `Version:` the implied bump and whether it was applied, or "not declared by this project".
- `Next:` "run /commit" when everything passed, or the first thing to fix otherwise.

## Guardrails

Prefer the project's package runner (`pnpm`, `npm`, `yarn`, `bun`) as the lockfile says. You never install dependencies, never delete or reset files, and never touch git state beyond reading it: no `git add`, no commit, no stash, no checkout. On Windows, run commands through the shell tool one at a time and read their exit codes.
