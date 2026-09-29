---
name: tdd
description: Use when implementing a feature or fixing a bug in code that has, or can have, automated tests, before writing the implementation.
---

# Test-driven development

Write the test first, watch it fail for the reason you expect, then write the smallest code that makes
it pass. A test you never saw fail may be testing nothing: it can pass because of a typo, a wrong
import, or behaviour that already existed.

## The cycle

Repeat for each behaviour, one at a time:

1. **Red.** Write one test for the next behaviour, named after what it proves. Run it and read the
   output. It must fail, and fail on the assertion you wrote, not on an import error or a typo. If it
   passes, either the behaviour already exists or the test is wrong: find out which before going on.
2. **Green.** Write the least code that makes that test pass. No extra options, branches or cleanup
   the test does not ask for.
3. **Check.** Run the project's tests in the reach of the change (the file you touched and the tests
   of its callers), not only the new test. Everything must pass, with no new warnings in the output.
4. **Refactor.** Improve names and structure with the tests green, and run them again.

For a bug fix, the first test reproduces the bug: it fails today with the symptom the user reported.
It then stays as the regression test.

## When the code came first

If implementation code already exists without a test (yours from earlier in this task, or the user's),
do not delete it. Write the test now, then prove it can fail: temporarily undo only your own change
(or break the branch the test covers), run the test, see it fail, restore, and run it again green. A
test that stays green with the behaviour removed proves nothing.

## When this does not apply

Say so in one line and continue without the cycle when:

- the user asked for a throwaway prototype or a spike;
- the change is configuration, generated code, or documentation only;
- the project has no test setup and the user does not want one added.

In every other case, missing tooling is part of the task: find the project's test command (README,
package or build configuration, existing tests) before writing code. Never assume a standard command.

## Good tests

Read `references/good-tests.md` before writing the first test of the task. In short: each test names
the break it catches, exercises the real code rather than a mock of it, and derives its expected value
independently of the implementation.

## Reporting

In the final message, for each behaviour or at least for the task, give the evidence of the cycle:
the command you ran, that it failed first and why, and the passing run after the change. If you
skipped the cycle, say which exception applied.
