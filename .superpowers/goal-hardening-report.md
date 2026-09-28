# Goal hardening report (B1 to B5)

Branch `goal-hardening`, working tree only. Nothing was committed, staged or stashed.

## Files

Changed:

- `packages/core/src/goals/goal-continuation-prompt.ts` (B1 to B4) and its test
- `packages/core/src/skills/bundled/goal-draft/SKILL.md` (B2, B3) and `SKILL.test.ts`
- `packages/core/src/tools/tools.ts`: `ToolConfirmationPayload.runPlanAsGoal?: boolean`
- `packages/core/src/tools/exitPlanMode.ts` and its test (B5)
- `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` and its test (B5)
- `packages/cli/src/ui/hooks/use-llm-stream.test.tsx`: the pinned wind-down hand-off line
- `packages/cli/src/i18n/locales/{en,pt,zh,zh-TW,de,fr,ja,ru,ca}.js`: `'Approve and run as a Goal'`
- `docs/users/features/goals.md`, `docs/users/features/approval-mode.md`, `CHANGELOG.md`

New:

- `packages/core/src/goals/plan-to-goal.ts` and `plan-to-goal.test.ts`

## Lines as landed

Continuation prompt, working turns (not the wind-down turn), in this order after the fidelity line:

1. `SCOPE_CHANGE_LINE` (every working turn): "If a real user message in this conversation adds,
   removes or redirects work beyond the objective, do not absorb it silently: say in one line that
   the objective would change, and point to /goal edit; keep working only on what the current
   objective asks."
2. `NO_PROGRESS_LINE` (unchanged, turn 1+).
3. `ANTI_LOOP_LINE` (turn 2+): the brief's text verbatim.
4. `SLICE_COMMIT_LINE` (every working turn): the brief's text verbatim.
5. `BLOCK_FORMAT_LINE` (every working turn): "When you report the Goal as blocked, give the
   context, what was tried, the options with a recommendation, one closed question, and what can
   continue meanwhile."
6. `COMPLETION_AUDIT_LINE` (unchanged, stays last).

`WIND_DOWN_LINES[1]`: "Deliver a concise hand-off: what was accomplished, naming the tool results
that show it; what remains; and the one concrete next step. If the Goal is blocked, give the
context, what was tried, the options with a recommendation, one closed question, and what can
continue meanwhile. Call update_goal only if the objective is already complete or genuinely
blocked on the evidence you have. Then end the turn." The block fields are one shared constant, so
the standing line and the hand-off cannot drift.

goal-draft `SKILL.md` template:

- `Must not: <files not to touch; tests/thresholds not to weaken; irreversible actions not to take; by default push, force-push, --no-verify unless the user allows them>`
- `On block: propose blocked with 1) the context in a few lines, 2) what was tried, 3) options A/B/C with a recommendation, 4) one closed question, 5) what continues meanwhile; never claim completion without evidence for every Done-when item`
- Both Weak → strong exemplars now show the five-part block and `--no-verify`; the PR-comments one
  keeps plain push as explicitly allowed, since its CI check needs a push.
- Self-check 5: "Budget or On block is present, and On block uses the five-part block format."
  Self-check 9: "... listed in Must not, with force-push and --no-verify by default, or the user
  explicitly allowed them."

## B5 path taken: the third option (bounded change)

The CLI plan dialog renders a `RadioButtonSelect` whose value is a `ToolConfirmationOutcome`; the
scheduler forwards `(outcome, payload)` to the tool's `onConfirm` unchanged. The new choice is not a
new outcome: the dialog adds a local value `run_plan_as_goal` that maps to
`onConfirm(ProceedOnce, { runPlanAsGoal: true })`. So the scheduler, ACP and every other host keep
the outcomes they know.

- Dialog order: restore previous mode, auto-accept edits (trusted only), manually approve edits,
  **Approve and run as a Goal**, keep planning. It is shown in untrusted folders too, since it
  approves with `DEFAULT` (edits approved one by one), no escalation.
- `exit_plan_mode` records `runAsGoal` on any approving outcome that carries the flag; a cancel
  ignores it. The result still starts with `User approved.`, so the approved-plan history
  redaction keyed on that prefix still runs, and the mode changes exactly as for a plain approval.
  The llmContent tells the model not to start on the plan, to draft the objective (one Done-when
  item per task with its check, Must not with the plan constraints plus push, force-push,
  --no-verify, Budget as `[ASSUMPTION]`, On block in the B2 format) and call `propose_goal`, at most
  1,500 characters (pinned by the test to `PROPOSE_GOAL_OBJECTIVE_MAX_CHARACTERS`), to print a
  `/goal set` line when the tool is unavailable, and to stop if the user declines. It ends with the
  `draftGoalFromPlan` first draft. The display message is "User approved. A Goal will be proposed
  for approval."
- `draftGoalFromPlan(planMarkdown)`: title from the first line or heading; tasks from top-level
  numbered items, falling back to headings (with `Step N:` stripped); a check per task from a
  `Verify:` / `Verification:` / `Check:` / `Test:` label inline or on a following line; a
  `Verification` section becomes trailing Done-when items; a `Constraints` / `Must not` / `Out of
scope` section feeds Must not. Missing pieces become `<TODO: …>`. One line.
- Plain approvals are byte-identical to before.

Not done: Web Shell and ACP. Their plan options are ACP `optionId`s equal to outcome values
(`permissionUtils.ts`, `Session.ts`, `acp-bridge`, the Web Shell panel); a new option there is a
multi-package contract change, not a bounded one. The docs say those clients do not offer it yet.

## Tests (TDD, each written failing first)

- `goal-continuation-prompt.test.ts`: 27 pass. New: ladder on turn 2+, not 0/1, kept with no
  figures; block/commit/scope lines on every working turn; none on wind-down; hand-off text;
  audit stays last. Pinned full prompts updated.
- `SKILL.test.ts`: 14 pass (new: template On block / Must not, exemplars, self-check).
- `plan-to-goal.test.ts`: 3 pass (numbered plan with checks, constraints and verification;
  heading plan; unreadable plan gives a TODO).
- `exitPlanMode.test.ts`: 39 pass together with the helper (new: plain approval unchanged, run as
  Goal, cancel ignores the flag).
- `ToolConfirmationMessage.test.tsx`: 56 pass (new: choice shown trusted and untrusted, selection
  sends ProceedOnce plus the flag, plain approval sends no payload).
- Also ran: `goal-tools.test.ts`, `coreToolScheduler.test.ts` (585 pass, 1 skipped with the
  above), `use-llm-stream.test.tsx`, `ToolMessage.test.tsx` (441 pass with the dialog test).

## Gates (one at a time, repo root)

- `npm run build -- --cli-only`: ok
- `npm run typecheck`: exit 0
- `npm run lint`: exit 0
- `node scripts/o1/brand-lint.mjs`: 0 lines with a forbidden name
- `npm run check-i18n`: all checks passed (key added to all 9 locales)
- prettier `--check` on the docs, CHANGELOG and SKILL.md: clean
- `npm run bundle`: ok
- `node scripts/o1/smoke.mjs`: PASS

## Real run

Scratch project with `package.json` (`"test": "node --test test/"`), `test/demo.test.js` and a
broken `src/add.js`; from Git Bash, `MSYS_NO_PATHCONV=1 node W:/workspace/pessoal/o1-code/dist/cli.js -p "/goal-draft make the demo test pass"`. The objective it printed:

```text
Outcome: the demo test in test/demo.test.js passes. Done when: 1) `npm test` exits 0 and its output shows `# fail 0` (paste that line and the `# pass` line), run immediately before proposing completion; 2) test/demo.test.js is unchanged from HEAD, shown by `git diff --exit-code HEAD -- test/demo.test.js` exiting 0 with no output. Must not: edit, skip, or weaken test/demo.test.js; change the test script in package.json; touch files outside src/; push, force-push, or use --no-verify. Budget: as model guidance, stop as blocked after 20 turns. On block: propose blocked with 1) the context in a few lines (the failing assertion output), 2) what was tried, 3) options A/B/C with a recommendation, 4) one closed question, 5) what continues meanwhile; never claim completion without evidence for every Done-when item. Context: the code under test is src/add.js (ESM, Node built-in test runner). [ASSUMPTION] the 20-turn budget is the drafter's default, not the user's.
```

Both new shapes are there. Headless, so it printed the `/goal set` line and "Nothing has been
applied yet", as designed. The plan-mode choice needs the interactive dialog, so it was checked by
tests only, not in a live TUI session.

## Deviations and decisions

- The anti-loop ladder also renders when the host sends no usage figures, following the
  no-progress line's rule (silence is not evidence of an early turn). The brief's turn 0/1
  exclusion holds whenever figures are present.
- The run-as-Goal choice approves in `DEFAULT` mode (like "manually approve edits"), not the
  previous mode or auto-edit, so it never escalates and works untrusted.
- The 1,500 limit is prose in `exitPlanMode.ts` (goal-tools is loaded lazily) and pinned to the
  constant by the test.
- `getPlanModeSystemReminder` was read but not changed; the brief did not ask for a change.

## Open points

- Web Shell and ACP do not offer the third choice (see above); the docs tell those users to ask the
  model instead.
- `draftGoalFromPlan` is a heuristic: a task whose text contains `test:` or `check:` mid-sentence is
  split there. The model is told to verify and refine the draft.
- The dialog now has five options; on a narrow terminal they wrap in column layout as before.
