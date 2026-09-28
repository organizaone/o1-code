---
name: debugging
description: Use when a test fails, an error appears, or behaviour differs from what is expected, before proposing or making a fix.
---

# Debugging

Find the cause before changing code. A fix made without knowing the cause usually moves the symptom,
and each guessed fix makes the next one harder to reason about.

## 1. Reproduce and read

- Read the whole error: message, stack trace, exit code, and the lines of output before it.
- Reproduce it with one command you can run again. If it does not reproduce reliably, collect more
  data (inputs, environment, timing) before going further; do not guess.
- Check what changed recently: the diff, new dependencies, configuration, environment.

## 2. Trace to the origin

- Follow the bad value backwards from where it shows up to where it was first wrong. Fix it there, not
  where it surfaced.
- When the path crosses components (a CLI calling a library calling a database), check the data at each
  boundary and find the first one where it is wrong.
- `references/root-cause-tracing.md` has techniques for traces that are not obvious: temporary
  logging with call stacks, finding which test pollutes shared state, waiting for conditions instead of
  timing.

## 3. Compare with something that works

- Find similar code in the same project that behaves correctly, or the reference the code is meant to
  follow, and read it completely.
- List every difference between the working and the broken case, however small.

## 4. One hypothesis at a time

- State it before acting: "X causes Y because Z."
- Test it with the smallest change or observation that could prove it wrong, one variable at a time.
- If it is wrong, form a new hypothesis from what you learned. Do not stack another change on top of the
  first.

## 5. Fix at the cause

- Write a test that reproduces the bug and fails (the `tdd` skill), then make one change at the cause.
- Run the reproduction and the project's tests in the reach of the change.
- Remove any temporary logging you added.

## When fixes keep failing

Follow the core rule for repeated failures: after the same fix fails twice, stop and re-read the
relevant code top-down, saying where your understanding was wrong. When each fix reveals a new problem
in a different place, the design is the likely cause: stop and bring the evidence to the user before
another attempt, or, when no one can be asked, report it as the blocker.

## Reporting

Say what the cause was, the evidence that shows it (command and output), what you changed, and how you
verified it. If you could not find the cause, say what you ruled out and what you would check next;
do not present a workaround as a fix.
