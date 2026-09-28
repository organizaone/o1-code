# Report: eight working-discipline lines in the system prompt

Branch `prompt-lines`. Nothing committed, staged or stashed.

## Files

- `packages/core/src/core/prompts.ts` - `getSoftwareEngineeringTasksSection()`: seven bullets inserted
  after `**Adapt:**`, two sentences appended to `**Verify (Tests):**`.
- `packages/core/src/core/prompts.test.ts` - `WORKING_DISCIPLINE_MARKERS` constant and two tests
  (default render; CodeModeOnly render).
- `packages/core/src/core/__snapshots__/prompts.test.ts.snap` - 17 snapshots updated.
- `CHANGELOG.md` - `[Unreleased]` / `### Agent` bullet, as given in the brief.

## Render variants

The workflow block has a single source, `getSoftwareEngineeringTasksSection(todoWriteEnabled)`,
called only from `buildDefaultBasePrompt()`. That builder serves the default render, CodeModeOnly,
declared tool surfaces, todo_write on/off, every model-specific example set, and the
`O1CODE_WRITE_SYSTEM_MD` dump. Plan mode adds a reminder on top of the same base prompt. So all
variants get the lines from one edit. They are absent in two cases, both unchanged by design: an
output style with `keepCodingInstructions: false` (drops the whole section) and a
`O1CODE_SYSTEM_MD` override. `gateToolGuidance` filters only `## Using Your Tools`, so the new
bullets are never gated by the declared tool set.

## Bullets as landed

- **Second failure:** If the same fix fails twice, stop. Read the whole relevant section of the code top-down and state where your model of it was wrong before trying again. On the fourth attempt, change strategy or ask.
- **Renames and signatures:** Text search is not an AST. On a rename or a signature change, search separately for every reference form: direct calls, type references, string literals, dynamic imports, `require()` loads, re-exports, barrel files and test mocks. Assume the search missed one and verify.
- **Deletions:** Never delete a file before verifying that nothing references it.
- **Long operations:** Form an expectation of how long a build, a test suite or a background command should take. If it produces no output or runs well past that, investigate (a hang, a prompt waiting for input, a wrong command, a runaway loop) instead of assuming it will finish.
- **Sub-agents:** Never spawn a background task just to wait for something; wait with one blocking call. Give each agent its own path for anything it writes outside the repository, tell it what else is running and which resources are taken, and retire it as soon as it delivers.
- **Editing files:** Use the editing tools to change files. Heredocs and `sed -i` corrupt backslashes and non-ASCII text, on Windows in particular.
- **Shared stateful resources:** Never restart, re-authenticate or reset a dev server, a database, a session or another shared resource as a side effect of some other action; do it only when that is the task, and say so.
- Appended to **Verify (Tests):** Scope the run to the reach of the change: the tests next to what changed, plus the tests of its importers when a shared module changed. Run the full suite only when asked, and always say what you did not run.

Wording changes from the brief: "a suite" became "a test suite"; "Use the editing tools." became
"Use the editing tools to change files."; the semicolon before "assume the search missed one"
became a full stop.

## Tests

- TDD: the two new tests failed first (red), then passed after the edit.
- `packages/core/src/core/prompts.test.ts`: 183/183 pass after `-u`. The snapshot diff was read
  first: in each of the 17 snapshots it is exactly the seven added bullets plus the extended
  `Verify (Tests)` line, nothing else.
- Other tests that call `getCoreSystemPrompt`: `ArenaManager.test.ts`, `client.test.ts`,
  `prompt-tool-examples.test.ts` (core, 469 pass) and `ui/commands/contextCommand.test.ts` (cli, 48
  pass). No other snapshot holds the workflow block.
- Not run: the full core and cli suites (per the brief).

## Gates (repo root, sequential)

- `npm run build -- --cli-only` - pass
- `npm run typecheck` - pass
- `npm run lint` - pass
- `node scripts/o1/brand-lint.mjs` - pass (0 forbidden lines)
- `npm run bundle` - pass; the new text is in `dist/chunks/chunk-UYKWFX5G.js`
- `node scripts/o1/smoke.mjs` - PASS

## Open points

- The prompt grows by about 2,000 characters in every render; the `/context` numbers shift accordingly.
- "Sub-agents" and "Editing files" are unconditional. With no agent tool or no edit tool declared,
  they still render. The brief puts them in the workflow block, not in the gated tool-guidance
  section. Gating them would need a change to the brief.
- `Editing files` partly overlaps the `Prefer Dedicated Tools` sub-bullets ("edit files use 'edit'
  instead of sed or awk"). That bullet is gated off when the shell is not declared; the new one is not.
