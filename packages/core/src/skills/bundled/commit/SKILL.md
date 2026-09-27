---
name: commit
description: Turn the uncommitted changes in the current git repository into one commit per logical change, with messages in the repository's own style, asking for confirmation before each commit. Use when the user asks to commit their work, split changes into commits, or write commit messages. Usage - /commit, or /commit <what changed> to give the intent behind the changes. It only commits; it never pushes.
argument-hint: '[what changed, optional]'
allowedTools:
  - run_shell_command
  - read_file
  - grep_search
  - glob
---

# /commit — one commit per logical change

You are already inside the loaded `commit` skill — do not call the `skill` tool to invoke it again; start with Step 0.

## Step 0 — ground rules

You only commit. You never push, never amend or rewrite history, never run `git add -A` or `git add .`, never create a WIP commit, and never stash. If there is nothing to commit, say so and stop.

Work only in the current repository and respect `.gitignore`. Never commit files that look like secrets (`.env`, private keys, tokens, credentials): leave them out and say so. Never touch submodules.

## Step 1 — gather the state

In one shell call where possible, run:

- `git status --porcelain=v1 -uall`
- `git diff HEAD --stat`
- `git diff HEAD` — read it. For a very large diff, read the stat and open the biggest hunks with `git diff HEAD -- <path>`.
- `git log -20 --format=%s` (subjects only) and `git log -3 --format=%B` (full bodies).

Untracked files do not appear in `git diff HEAD`: read the ones you need with `read_file`. In a repository with no commits yet, use `git status` and `git diff --cached` instead of the `HEAD` forms.

## Step 2 — detect the message style

From the last 20 subjects, detect the pattern the repository uses: conventional (`type(scope): …`), `<Verb> <Area>: …`, plain imperative, or another consistent one. Detect the predominant language too.

If the history is empty or inconsistent, use the commit format the project's instruction file declares (for example `AGENTS.md`), if it declares one; otherwise write a short imperative English subject. Never mix languages within a repository.

## Step 3 — group the changes

Split the changes into logical units, one intent per commit: a fix, a feature, a refactor, a docs update, a tooling change. Files that belong together — a source file, its test, its doc — stay in the same unit.

When the grouping is ambiguous, ask once with `ask_user_question`, offering the split you recommend and "one commit for everything".

## Step 4 — draft each message

For each unit, write the subject in the detected style: what changed and why, no trailing period, no version numbers, no emoji, no mention of tools or of who or what wrote the code, and no co-author trailers. The product's `general.gitCoAuthor` setting adds its own trailer through the shell tool; do not add it and do not remove it.

Add a body only when the why does not fit the subject: short paragraphs, wrapped at 72 columns.

## Step 5 — confirm each commit

**Always confirm before committing.** Call `ask_user_question` once per commit, showing the exact message and the file list, with the options "Commit", "Edit the message" and "Skip this group". On "Edit the message", ask for the new text through the free-text `Other` answer. This confirmation is required even when everything is unambiguous.

If the question cannot be asked (headless, or the tool is unavailable or refuses), commit nothing: print each proposed commit — its message and files — and stop.

## Step 6 — commit and verify

For each confirmed unit:

1. Stage exactly its files with `git add -- <paths>`. For a rename or a deletion, pass both the old and the new path.
2. Commit with `git commit -m <subject>`, plus `-m <paragraph>` for each body paragraph, or through a temporary message file with `git commit -F <file>`; never a heredoc.
3. Verify with `git log -1 --format=%B` and `git status --porcelain`.

If a pre-commit hook fails, report its output, do not retry with `--no-verify`, and stop.

## Step 7 — report

List the commits made (short hash and subject) and what was left uncommitted, and why. Do not push, and do not suggest pushing unless the user asks.

## What changed

If the user wrote text after `/commit`, it describes the intent behind the changes. Use it to group the changes and to word the messages; it never widens the scope beyond the files that changed.
