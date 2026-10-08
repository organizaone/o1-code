# Task Completion Workflow

## Purpose

This document is the mandatory orchestrator that runs at the end of every completed logical unit of change. It defines the fixed sequence **build → lint → test → docs → version → commit → merge** and the behavior for every edge case in that sequence. It delegates concrete commands (build, lint, test, version bump) to the stack-specific documentation of the consuming project, and delegates message and bump-level rules to `COMMITS.md` and `VERSIONING.md` respectively.

Any change that reaches the repository history MUST go through this workflow, except for the closed list of exceptions in section "Documented Exceptions".

## Trigger — What Counts as a Completed Task

A **logical unit of change** is a cohesive set of modifications that:

1. Resolves a single intent (a fix, a feature, a contained refactor, a dependency update).
2. Leaves the code in a valid, buildable, testable state.
3. Can be described by a single commit message with a single commit type.

Examples that trigger the cycle:

- Fixing a bug.
- Adding a feature or a deliverable sub-feature.
- Refactoring a contained area of the code.
- Updating a dependency.
- Removing dead code.

Examples that do NOT trigger the full cycle (see "Documented Exceptions"):

- Changes exclusive to documentation files.
- Changes exclusive to CI/CD configuration.
- Changes exclusive to development-tool configuration.

**WIP commits are forbidden.** Every commit in the history must represent either a complete successful cycle or one of the documented exceptions.

## The Mandatory Sequence

Steps 1–6 run in this fixed order. Reordering is not allowed. Step 7 runs only
when the work is merged.

```
┌─────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐  ┌─────────┐  ┌─────────┐
│ 1 BUILD │─►│ 2 LINT │─►│ 3 TEST │─►│ 4 DOCS │─►│ 5 VERSION│─►│6 COMMIT │─►│ 7 MERGE │
└─────────┘  └────────┘  └────────┘  └────────┘  └──────────┘  └─────────┘  └─────────┘
     │            │           │                                              only when
     │ fail       │ fail      │ fail                                         merged
     ▼            ▼           ▼
   abort, fix, restart from Step 1
```

A failure at Steps 1, 2, 3 or 6 aborts the cycle. After fixing the underlying problem, the cycle restarts from **Step 1** — not from the failed step — because the source code has changed and the previous build/lint/test results are no longer valid. Steps 4 and 5 are the two exceptions, and the Failure Handling table states them: a documentation gap is closed before continuing, and a wrong bump is reverted and reapplied at Step 5, because neither touched the source.

## Step 1 — Build

- The concrete build command is defined by the stack documentation of the project (for example, `BACKEND-JAVA.md`, `BACKEND-NODE.md`, `BACKEND-PYTHON.md`, `FRONTEND-REACT.md`, or any future stack document).
- Execute the full build declared by the stack doc.
- This step cannot be skipped for any reason, including "the change is small" or "it only touches one file".
- On failure: abort the cycle, fix the underlying problem, restart from Step 1.

## Step 2 — Lint

- The concrete lint command is defined by the stack documentation of the project.
- Execute the linter over the whole project, not only over the files the change touched — a change can break a rule in a file it never edited (an import that is now unused, a symbol that is now dead).
- **Fix every error.** Warnings are allowed unless the project's documentation says otherwise — a project that declares a zero-warning policy treats a warning as an error, and a change that introduces one fails this step.
- This step cannot be skipped.
- On failure: abort the cycle, fix the underlying problem, restart from Step 1 (the build must run again because the code changed).

## Step 3 — Test

- The concrete test command and scope are defined by the stack documentation of the project.
- Execute the test suite declared by the stack doc, scoped to the reach of the change (below).
- **Scope the test run to the reach of the change, and treat the whole end-to-end suite as an on-demand gate.** A suite that takes tens of minutes, spins up browsers, consumes shared fixtures or creates throwaway accounts is not free, and running it after every small change trades hours for a signal the change could not have moved. Three levels: a local change with no shared component runs the build, the linter, the unit tests and the specs of the area it touches; a change to a shared component, hook or test harness adds the neighbouring areas; a cross-cutting change (design tokens, a base dialog, navigation, fixtures, test configuration) adds everything its reach actually covers — and then **asks** for the full run rather than starting it. The user, not the agent, decides when the whole suite runs; one full run before a release candidate is what makes it worth its cost.
- **Say what you ran and what you did not.** The commit message, or the pull request when the project uses one, records the exact commands executed and states plainly that the full suite was not run, when it was not. A reader must never infer coverage that does not exist.
- **Infrastructure changes are tested too.** A migration, a grant, a policy or a trigger that "should" lock something down is proven by a read-only script that asserts the whole matrix (grants, `search_path`, policies, trigger presence) against the real database and exits non-zero on any deviation. The script is committed and re-run after any later change touching the same objects — defaults re-grant on `DROP` + `CREATE`, so a rule proven once is not proven forever. The stack or companion doc (for example `PERSISTENCE-SUPABASE.md`) says what the script checks.
- This step cannot be skipped.
- On failure: abort the cycle, fix the underlying problem, restart from Step 1 (the build must run again because the code changed).

## Step 4 — Documentation Sync

- When the change alters anything user- or developer-facing, update the affected documentation **as part of the same task**, so docs never drift from the code.
- Sync triggers include: new or changed features/behavior; dependency or version changes; new/changed scripts, commands, or env vars; configuration or routes; **database schema** (also regenerate any types the project derives from it); serverless or edge functions; and any counts/metrics/examples referenced in docs.
- Files to keep current: `README.md` (project overview), the agent-guidance file if the project keeps one (`CLAUDE.md`, `AGENTS.md`, or equivalent), the architecture document if the project keeps one, and any specific guide impacted by the change.
- If the change touches nothing documented, this step is an explicit no-op (state it). Do **not** create new documentation files unless the task requests it — update the existing canonical docs.
- **The backlog is documentation too.** If the project keeps one, and this task closed, changed or invalidated an item in it, say so here — and **write down what proves it**, not just a tick. An item marked done without evidence is re-verified by the next person, or worse, trusted when it is no longer true.
- **An item this task discovered but did not solve is opened in the same cycle.** A defect noticed in passing and not written down is a defect found again from scratch later.
- **Per-task sync does not stop drift; schedule a full audit.** Every document drifts toward the milestone where it was last rewritten, and a task only verifies what it touched. Periodically — at a release, after a large refactor, or whenever a reader finds two documents contradicting each other — audit the documentation **claim by claim**: every checkable statement (paths, counts, commands, flags, versions) is verified against the code. Run it with parallel sub-agents, one per document group (`AGENT-WORKFLOW.md`, Context Management), each reporting `file:line — claim → reality (evidence)` with a severity tag. Fix in rounds, source of truth first: the agent-guidance file, then the guides, then test documentation, then external or publishing documents — a downstream document fixed before its source is redone when the source changes.
- Documentation edits are committed together with the change at Step 6 (not as a separate commit). A separate "update docs" commit afterwards splits one logical unit of change across two cycles.

## Step 5 — Version

- The rules for choosing the bump level (`MAJOR`, `MINOR`, `PATCH`) are defined in `VERSIONING.md`.
- The mechanism for applying the bump (which file holds the version, which command updates it) is defined by the stack documentation of the project.
- **Prerequisite:** the project MUST have a version mechanism configured before the first completion cycle. If no mechanism exists, this step fails — see "Failure Handling".
- Version files must never be edited manually. Always use the mechanism declared by the stack doc.

## Step 6 — Commit

- The rules for writing the commit message are defined in `COMMITS.md`.
- The commit message MUST NOT reference the version number generated in Step 5. The single exception is the release-changelog commit described in Step 7, which exists only to name a version.
- The commit message MUST NOT contain any form of co-authorship, attribution, or mention of AI agents or automated tools. The same applies to the **title and description of the pull request** that carries the commit — a "generated with" line in a PR body is the same attribution in a different place.
- One commit per completed task. No WIP, no squash of unrelated changes.

## Step 7 — Merge

Runs **only when the task's work is merged** into the mainline. A task that ends at a commit ends at Step 6.

- **Add the changelog entry now, not at release time.** If the project keeps a changelog, the merge is when someone still remembers what the change does. Written later, from a diff, an entry becomes a list of file names — which is exactly the entry nobody reads.
- **Write it for whoever uses the product**, not for whoever wrote the code: what behaviour changed, and where it is visible. A defect entry says what was going wrong, because that is what tells a reader whether it affected them.
- **Group it under an unreleased heading.** Several tasks usually ship in one release, so the entry lands under a heading such as `[Unreleased]`, which is renamed to the version and date when that release is tagged. Writing entries directly under a version fails as soon as two merges share it.
- **The rename at tag time is a documentation-only commit** (`Update changelog: release X.Y.Z`). It is the one commit allowed to name a version — the version *is* what it records — and it follows the documentation-only exception below.
- **Reconcile the backlog with reality.** Mark what this task closed, with the evidence. Remove what stopped making sense — an item kept out of politeness costs attention every time someone reads the list.
- **Delete the design specs and plans the work was built from.** A working paper left in the repository describes the system as intended, not as shipped, and gets cited as truth later. The changelog entry and the updated guides are the record; whatever reasoning in the spec still matters is moved into them before the file goes.
- Changelog, backlog and spec-removal edits are committed on the branch **before** the merge, so the merge carries them.

## Failure Handling

| Step    | Failure                                                   | Action                                                       |
|---------|-----------------------------------------------------------|--------------------------------------------------------------|
| Build   | Compilation or build error                                | Abort cycle. Fix. Restart from Step 1.                       |
| Lint    | Lint errors (or warnings, where the project forbids them) | Abort cycle. Fix. Restart from Step 1.                       |
| Test    | One or more tests fail                                    | Abort cycle. Fix. Restart from Step 1.                       |
| Docs    | Docs left inconsistent with the change                    | Update the affected docs before continuing to Step 5.        |
| Version | Project has no version mechanism                          | Abort cycle. Stop and report to the user. Mechanism must be created before any cycle can run. |
| Version | Wrong bump level applied                                  | Revert the bump. Restart from Step 5.                        |
| Commit  | Pre-commit hook or format failure                         | Fix the underlying issue. Restart from Step 1 (the code changed). |
| Merge   | Changelog entry missing after a merge                     | Add it in a follow-up commit on the mainline. Do not wait for the release. |
| Merge   | Backlog left claiming work that is done                   | Correct it with the evidence. A stale backlog is worse than no backlog. |

No commit may exist in history without a successful full cycle, except for the cases in "Documented Exceptions".

## Documented Exceptions

The following cases are the ONLY situations where a commit is allowed without running the full cycle. Each case requires that the changeset touches exclusively the file categories listed — any mix with source code disqualifies the exception and forces the full cycle.

1. **Documentation-only changes.** Changes exclusive to `.md` files or other documentation assets.
2. **CI/CD-only changes.** Changes exclusive to CI/CD configuration files (for example, GitHub Actions workflows, GitLab CI files, pipeline definitions).
3. **Dev-tooling-only changes.** Changes exclusive to development-tool configuration files (for example, `.editorconfig`, `.gitignore`, linter and formatter configuration, IDE settings).

For an exception commit:

- Steps 1 through 5 are skipped (build, lint, test, docs-sync gate, version).
- Step 6 still applies: the commit message must follow `COMMITS.md` rules, including the type. An edit to an existing document is `Update`; a new document is `Add`; a deletion is `Remove`. The exception waives Steps 1–5, never the message rules.
- Mixed changesets (code plus any of the above) are NOT exceptions — run the full cycle.

## Rules

1. Never skip steps, regardless of how small the change appears.
2. Never commit with a failing build, lint errors, or failing tests.
3. Keep documentation in sync — never leave the README, the agent-guidance file, the architecture document, or any guide describing behavior, versions, or schema that no longer match the code.
4. Never edit version files manually.
5. Never add co-authorship, attribution, or any mention of AI or automated tools to commit messages, pull request titles, or pull request descriptions.
6. If the project has no version mechanism configured, stop the cycle and report to the user.
7. On a failure at Steps 1, 2, 3 or 6, restart the cycle from Step 1 — never from the failed step. Steps 4 and 5 are handled as the Failure Handling table states.
8. One completed logical unit of change equals one cycle equals one commit.

## See Also

- `AGENT-WORKFLOW.md` — Operating discipline for the work that precedes this cycle (planning, context, edit safety). Hands off to this document once the change is complete.
- `LOCAL-DEPLOY.md` — The optional `SMOKE` gate that deploys into a local container and verifies it starts. It sits beside this cycle, not inside it, and covers what a green cycle structurally cannot see.
- `AUTONOMOUS-EXECUTION.md` — The unsupervised execution mode: every slice it runs closes through this cycle, and its "Definition of Done" requires Step 7 plus the promotion of its own control files.
- `VERSIONING.md` — Rules for choosing the bump level at Step 5.
- `COMMITS.md` — Rules for writing the message at Step 6.
- Stack documentation of the consuming project — Concrete build, lint, test, and version-bump commands.

## Deviations in this project

- **Step 3, test reach.** The full suite is expensive (3 GB heap, thousands of files).
  The CI's explicitly requested `full` matrix runs `npm run test:ci` for core, CLI,
  SDK, ACP bridge, Node REPL, VS Code companion and audio capture. Web Shell tests
  run separately among the fast gates. Full core and CLI suites
  never run locally. Locally, the reach of the change is what counts, with
  `cd packages/<cli|core> && npx vitest run <file>`.
- **Step 7, through a pull request.** Since 0.1.0, `main` is protected: no direct push, linear
  history, and the CI's fast gates must pass on the pull request before it merges. The project
  has a single maintainer, so no approving review is required; the independent review agent and
  the self-review below stand in for it. The pull request follows
  `.github/pull_request_template.md`. The changelog is `CHANGELOG.md`.
- **Additional gate before any push, the CI fast gates run locally.** A pull request must not be
  the first place a gate runs: each push starts a pipeline, and a red one costs a round trip.
  Before pushing a branch, run what the fast gates run, in this order (one heavy job at a time):

  ```bash
  npm run build -- --cli-only && npm run bundle
  npm run lint && npm run typecheck
  node --test scripts/o1/*.test.mjs && npm run test:scripts
  node scripts/o1/brand-lint.mjs && node scripts/o1/smoke.mjs && node scripts/o1/provider-smoke.mjs
  ```

  Add `cd packages/web-shell && npx vitest run --config vitest.config.ts` when the change touches
  the Web Shell, and `npx prettier --check <changed .md files>` plus
  `node scripts/o1/check-guides.mjs` when it touches documentation. The scoped product tests of
  Step 3 still apply. `npm run test:scripts` is easy to forget and is the one that tests the
  build and packaging scripts (`scripts/*.js`): a change there is not verified without it.
- **Pull requests only with the maintainer's OK.** Work stays in local commits until the
  maintainer approves proposing it: a branch is pushed and a pull request opened (or an open one
  updated) only after that OK, for that change. Approval to merge one pull request does not
  extend to opening another. Changes are batched so that one pipeline run covers them.
- **Additional gate before Step 6, self-review of the diff.** Before declaring a change done,
  reread the whole diff in open-ended passes, **assuming each green test may be asserting the wrong thing**: check what the test observes, not
  only that it passes. A test that would also pass without the change proves nothing about it.
  Stop only after two consecutive passes that find nothing. This is the author's own discipline;
  an independent review agent looks from a different angle and does not replace it.
