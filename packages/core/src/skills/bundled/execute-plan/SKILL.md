---
name: execute-plan
description: Use when carrying out an approved implementation plan in this session, task by task.
---

# Executing a plan

The plan already made the decisions. Carry them out in order, prove each task with its tests, and keep
a record that survives your own forgetting.

## Before the first task

1. Read the whole plan once and note its global constraints.
2. Workspace: if the user wants the work isolated from the current branch, create a worktree with the
   worktree tool; ask once if the plan is large and they have not said. Do not create one on your own.
3. Run the project's tests in the reach of the plan and note the result, so a later failure can be told
   apart from one that was already there.
4. Put one todo item per task in the todo list when the tool is available.

## Each task

1. Read the task again from the plan: what you remember is a summary.
2. Follow its steps with the `tdd` skill: the test fails first for the stated reason, then passes.
3. Compare every `Expected:` in the task with what you actually saw.
4. Commit the task on its own, staging only its files (through `/commit`).
5. Mark the todo item done.

When the code does not behave as the plan says, use the `debugging` skill. When the plan itself is
wrong or silent, decide, and record the decision as `Ruling: <what> — <why> — <cost if wrong>` in the
todo item and in your final report. The requirements win over the plan; your judgement settles what
neither answers.

## When to stop

Continue between tasks without asking. Stop and ask only for:

- an irreversible or destructive action;
- a security-sensitive action;
- a side effect outside the workspace that is normally confirmed first (merge, push, publish);
- a plan so broken that every way forward is a guess.

## After the last task

1. Run the project's build, lint and the tests in the reach of all tasks.
2. Ask one fresh reviewer, with the agent tool, to review the whole change: give it the plan's location
   or text, the global constraints, the review focus and the commit range, and ask for findings graded
   critical, important or minor, with file and line.
3. Fix critical and important findings in one pass, each with a test, and run the checks again. List
   the minor ones.
4. Report: what was built, the evidence that it works, every ruling you made, and the deferred minor
   findings.
