---
name: write-plan
description: Use when requirements or a design are agreed for multi-step work and a written implementation plan is needed before editing code.
---

# Writing an implementation plan

A plan records the decisions an implementer cannot make alone: which files, which names and
signatures, which values from the requirements, and which tests prove each task. Write it for an
engineer who knows the language well but has not seen this codebase or this conversation. A plan
longer than the code it describes has written the code instead of deciding it.

## Structure

```markdown
# <Feature> implementation plan

Goal: <one sentence>
Approach: <two or three sentences>

## Global constraints

<one line each: requirements that hold for every task, with exact values>

## Review focus

<the input classes or failure modes most likely to break this work>

## Files

<each file created or changed, and its one responsibility>

### Task 1: <component>

Files: create/modify <paths>; test <path>
Interfaces: consumes <names and signatures from earlier tasks>; produces <names and signatures>

- [ ] Write the failing test for <behaviour>. Run `<command>`. Expected: fails with <reason>.
- [ ] Implement <what>, in <file>, with <signature>.
- [ ] Run `<command>`. Expected: <passing output>.
- [ ] Commit.
```

## Rules for tasks and steps

- A task is the smallest unit with its own test cycle that a reviewer could accept or reject on its
  own. Fold setup, configuration and documentation into the task that needs them.
- A step is one action with a result that can be checked. A step is complete when the implementer can
  do exactly one reasonable thing from it: exact paths, exact commands, exact values from the
  requirements. Leave the bodies of functions to the implementer.
- Names and types used across tasks appear in the Interfaces lines, so each task can be read alone.
- Order tasks so that each one leaves the project building and its tests passing.

## Check the plan before handing it over

1. Every requirement maps to at least one task.
2. No placeholder is left ("TBD", "handle errors", "add tests").
3. A name is spelled the same in every task that uses it.
4. The review focus is filled in, or says you checked and found nothing.
5. The plan is shorter than the code it describes.

## Hand-off

When plan mode is active, submit the plan through plan mode; the harness keeps the approved plan.
Otherwise present it in the conversation and wait for approval. Then offer the two ways to run it:
task by task in this session with the `execute-plan` skill, or unattended as a Goal (`/goal`).
