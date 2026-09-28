# Good tests

Two questions decide whether a test is worth keeping: what break does it catch, and would it notice if
the real code stopped working?

## Each test names the break it catches

- Name the test after the behaviour and the condition: `rejects a blank title`, `lists done tasks
last`, not `test_add_2`.
- One behaviour per test. When it fails, the name alone should tell the reader what broke.
- Before writing the body, say which wrong implementation would make it fail: a wrong constant, a
  missing branch, a missing side effect, an empty return, a skipped validation. If none would, the test
  is not needed.

## Each test exercises the real thing

- Drive the code the way its users do: call the public function, run the command, send the request.
- Mock only what you do not own or cannot run in a test (a network service, the clock, randomness),
  and at the boundary where your code meets it. A mock earns no assertions of its own: asserting that
  a mock was called with what you just configured it to return tests the mock.
- Use real data shapes. A fixture missing fields the real data has hides the bugs those fields cause.

## Expected values come from outside the code

- Work the expected value out from the requirement, not by running the code and pasting what it
  printed.
- Do not assert on implementation constants (`MAX_RETRIES == 5`) or on the exact text of a source file:
  that proves the source is the source.

## Keep the suite honest

- A test must be able to fail. After writing it, break the code once (or check it against the code
  without your change) and watch it go red.
- Clean up what the test creates (files, databases, environment variables) inside the test or its
  fixture, so tests pass in any order.
- A flaky test is a defect: wait for the condition the test depends on, with a timeout, instead of
  sleeping a fixed time.
