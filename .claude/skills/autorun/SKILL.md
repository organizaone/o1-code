---
name: autorun
description: Start an autonomous execution round over a plan that already exists in the conversation or the repository. Use when the user writes AUTORUN or AUTÔNOMO, or invokes /autorun. Slices the plan, executes to completion, keeps state in ops/, and stops only for escalation or HALT.
---

# Autonomous Execution Round

Read `AUTONOMOUS-EXECUTION.md` in this repository (or in the project's guides
directory) before anything else. It is the contract; this file is the trigger.

## Do this now

1. Read the project's `AGENTS.md`, the plan already in context, and the
   repository state. **Never ask for the plan, never ask for confirmation.**
2. If `ops/` exists with an unfinished `TODO.md`, resume from its "Now" block.
   Otherwise derive phases, tasks and verifiable acceptance from the context,
   write `ops/TODO.md`, create `PROGRESS.md`, `DECISIONS.md` and `REPORT.md`
   empty, and add `ops/` to `.gitignore` if it is missing.
3. Open the reply with the acknowledgement line, in the language of the
   conversation, and nothing before it:

   `AUTORUN active — <N> phases, <M> tasks. First: <id> <description>. Stopping only for escalation or HALT.`

4. Enter the slice cycle (plan → review → implement → review → run → close) and
   stay in it. Each slice closes through `TASK-COMPLETION.md`. Commit per slice;
   **do not push until the round completes**.

## Leave only through

- `HALT` or `PARAR` — stop now, keep `ops/`, report the position, push nothing.
- Completion — Definition of Done met, decisions promoted, `ops/` emptied, push.
- A blocking escalation — one question, only the dependent task blocked.
- A scope change from the user — say the round ended, do not absorb it silently.

## Never

- Ask "may I continue?" between slices.
- Mark a task done without a command executed and a result observed.
- Widen the scope: what appears mid-way becomes a task or goes out of scope.
