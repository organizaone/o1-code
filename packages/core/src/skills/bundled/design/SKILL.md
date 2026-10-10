---
name: design
description: Use when about to build a feature, component or project, or change behaviour, and what to build and how is not settled yet.
---

# Design before building

Settle what to build, and how, before writing product code. The amount of design scales with the
task: a question gets a probe, a change to an existing flow gets a short design in the conversation, a
new system gets a full design that becomes the plan.

## 1. Classify the request, and say it

Read the relevant code first. Then pick one path and tell the user which one, in one line:

- **Spike**: the question is whether something is feasible or how something behaves.
- **Bounded**: a well-scoped change to a flow that already exists in this project.
- **Architectural**: a new project, subsystem, interface or data model, or a request that spans
  several independent parts.

When two paths could fit, take the heavier one. If the work turns out bigger than it looked, move up a
path and say so; never move down in the middle of a task. A request that spans several independent
parts is split: each part gets its own design, plan and implementation, one at a time.

## 2. Understand the intent

- Ask about the purpose before proposing features: what the user wants to achieve and for whom.
- One question per message, with choices when the answers are predictable. Never ask what the code can
  tell you.
- Write back your understanding, separating what the user said from what you assume.
- When the session cannot ask questions, state the assumptions you made and continue on them.

## 3. Follow the path

**Spike.** Describe the probe in two or three sentences, run it, and report a recommendation with the
evidence. Anything you built for it is throwaway: say so, and do not present it as the implementation.

**Bounded.** Present a short design in the conversation: what changes, where, what stays untouched, and
how it will be tested. Wait for the user's approval, then implement it (with the `tdd` skill when the
code has tests). No design document and no separate plan.

**Architectural.**

1. Propose two or three approaches with their trade-offs and say which one you recommend and why.
2. Present the design in sections, each a few sentences to a short page depending on its weight:
   components and their single responsibilities, interfaces between them, data flow, error handling,
   and testing. Ask for approval after each section.
3. Check the whole design once before the last approval: no placeholders, no contradictions between
   sections, nothing in scope that was not asked for. Save the approved design under the same
   location rule as `write-plan`, in the project's specs location or, when it has none,
   `docs/specs/YYYY-MM-DD-<topic>.md`.
4. Hand it to the `write-plan` skill. The approved design is the plan's source; when plan mode is active, the
   plan is submitted there and the harness keeps it.

## Approval covers only what was shown

Approving an idea does not approve a design that has not been presented yet, and approving a design
does not approve the plan. Each stage waits for its own yes. Read-only exploration needs no approval.

A session that cannot ask questions (headless, or no one to answer) cannot wait for a yes: at each
stage take the option you recommend, state it and the assumptions behind it in your report, and
continue.

## Keep it small

Design only what the request needs. Leave out options, abstractions and features nobody asked for, and
prefer units with one clear purpose that can be understood and tested on their own.
