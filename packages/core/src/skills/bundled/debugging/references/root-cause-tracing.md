# Root-cause tracing

## Trace backwards

1. Note where the wrong value or behaviour is observed.
2. Find the code that produced it and the input it received.
3. Ask where that input came from, and repeat until you reach the first place the value is wrong.
4. That place is the cause. Everything after it only carried the value along.

When reading is not enough, add temporary instrumentation at each step: log the value together with a
call stack (in JavaScript `new Error().stack`, in Python `traceback.format_stack()`), write it to
stderr, and run the reproduction. Remove the instrumentation before finishing.

## Check every boundary

In a chain of components, log what enters and leaves each one in a single run. The first boundary where
the data is wrong narrows the search to one component. This beats reading all the code when the chain
is long or partly outside the project.

## A test that fails only with others

When a test passes alone and fails in the suite, another test is leaving state behind (a file, a
database row, a global, an environment variable). Run the failing test together with halves of the
suite that ran before it, keep the half that still fails, and repeat until one test remains. Then fix
the cleanup in that test, not the victim.

## Timing and flakiness

A test or script that sleeps a fixed time and then checks a result fails on slow machines and wastes
time on fast ones. Wait for the condition instead: poll it at a short interval, with an overall
timeout and a message that says what was being waited for. Keep a fixed delay only when the behaviour
itself is time-based (a debounce, a retry interval), and say so next to the delay.

## Make it impossible, not just fixed

After fixing the cause, check whether the same bad value can enter through another path. Validate where
data enters the system, so that the next caller cannot reintroduce the bug.
