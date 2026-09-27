# AGENTS.md

Single source of rules for this repository. Every tool-specific instruction file is a pointer to this
one, never a copy.

## What this repository is

o1-code is a terminal coding agent, licensed under Apache-2.0. It works with any model provider
given by URL, OpenAI-compatible or Anthropic. The principles are in `README.md`, the state of each
package and what comes next in `ROADMAP.md`, how to propose and weigh a feature in
`CONTRIBUTING.md`. Changes are recorded in the git history and in `CHANGELOG.md`.

## Project rules

1. **Extension mechanisms first, when they solve it.** Skills, hooks, MCP, rules, output styles,
   themes, and `modelProviders` remain the cheapest path for a lot of things, but the core is ours to
   change when they do not suffice. A large feature, or one inspired by another project, gets an
   evaluation card as a GitHub issue, following "Proposing a feature" in `CONTRIBUTING.md`.
2. **License.** The Apache-2.0 §4(b) modification notice is the global one in `NOTICE`. Third-party
   copyright headers stay in the files (§4(c)); never remove or rewrite them. New files carry
   `Copyright 2026 o1-code contributors`.
3. **Identity comes from `brand.json`.** New code reads from there; a branding change is a direct
   edit to the code. No third-party name as identity on a user surface; `node scripts/o1/brand-lint.mjs`
   is the gate. A provider's name appears only where it names that provider and its models.
4. **Out of scope, and out of the tree**: desktop, mobile, the Chrome extension and the browser tool,
   computer use and its Rust driver, messaging channels, the Java and Python SDKs, and the GitHub
   Action integration. They do not come back without a
   maintainer decision. The Web Shell, the interface for `o1-code serve`, is in scope.

## Commands

Install normally, without `--ignore-scripts`. `prepare` generates the necessary sources and stops
there; build and bundle are explicit commands (`O1CODE_PREPARE_BUILD=1` makes install build too).
`postinstall` applies `patches/ink+7.0.3.patch`, without which `packages/cli` does not compile.

```bash
corepack pnpm install --frozen-lockfile
npm run build -- --cli-only     # builds the CLI and its workspace dependencies
npm run bundle                  # generates dist/cli.js
npm run lint && npm run typecheck
node scripts/o1/smoke.mjs       # the bundle starts and responds
node scripts/o1/provider-smoke.mjs # provider by own URL, OpenAI-compatible and Anthropic, no network
node scripts/o1/brand-lint.mjs     # third-party name on a user surface (lint against brand.json)
node scripts/o1/check-guides.mjs
node --test scripts/o1/*.test.mjs  # tests for the project's scripts (the directory alone fails on Node 22)
npm run test:scripts              # tests for the build scripts, with their own config and setup
```

Product tests run per package, never from the root:

```bash
cd packages/core && npx vitest run src/path/file.test.ts
cd packages/cli  && npx vitest run src/path/file.test.tsx
```

Corepack does not ship with Node 26: install it with `npm i -g corepack`.

## Required local configuration

One option lives in the repository's local configuration, not in a versioned file, and a fresh clone
does not have it:

```bash
git config core.longpaths true      # without this, checking out this tree fails on Windows
```

## Language

**English is the language of the repository.** This applies everywhere, including package READMEs:
implementation, identifier names, comments, log messages, test names, commit messages, and the guides
in `docs/guides/`, including their deviation sections. The product's interface follows the user's
locale, with pt-BR reviewed by hand.

One exception, deliberate: the conversation with the maintainer, which follows the maintainer's own
language.

## Code conventions

ESM in every package,
strict TypeScript, no `any`, file names in `kebab-case.ts` and `PascalCase.tsx`, imports from
`packages/core` through the module that defines the symbol rather than the package root, tests next to
the source, comments only when the why is not obvious. Stack details and the Windows rules are in
`docs/guides/STACK-O1-CODE.md`.

On Windows, edit files with the editor tool, not with the shell: heredocs and `sed -i` corrupt
backslashes and non-ASCII text.

## Code Review

Project-specific rules for `/review`. The skill loads this section verbatim (by
its `## Code Review` heading) and hands it to every review agent, so it holds
only what a reviewer of _this_ repository must check. The first group covers the
code in general; the second covers identity, contracts and licensing.

- **Verify a finding against the exact reviewed commit before reporting it.**
  Read the lines you are about to cite. Do not report a defect you have only
  inferred from a symbol name or a diff fragment.
- **A `C=0` / APPROVE is a claim, not a default.** Check each unresolved
  Critical already on the PR against the code as it stands: _still stands_ /
  _fixed by this diff_ / _cannot tell_.
- **For every added field, option, or optional parameter, grep its read sites**,
  including outside the diff. A field declared and read but never set by any
  caller is a dead switch.
- **Classify every added or changed daemon route by ownership** and verify that
  workspace-scoped routes never fall back to the primary runtime.
- **Match the house style.** ESM only; no `any`; no relative imports between
  packages; `kebab-case.ts` and `PascalCase.tsx`; tests collocated; comments only
  where the _why_ is not obvious.
- **A missing test for changed behavior is a Suggestion, not a Critical**, unless
  the untested path is itself the defect.

Identity, contract and license rules:

- **No third-party name as identity on a user surface.** New text in the
  interface, locales, system prompt or user docs that names another product is a
  Critical unless it names a provider or a model; `node scripts/o1/brand-lint.mjs`
  checks it.
- **Renaming one side of a contract is a Critical.** A string compared at run
  time — a bundle id, a header, a payload field, a telemetry event name, a file
  name one module writes and another reads — must change on every side or on
  none.
- **Third-party copyright headers stay.** Removing or rewriting a copyright
  header that is not the project's own is a Critical (Apache-2.0 §4(c)).
- **Names inside regular expressions hide from a plain search.** A product name
  inside an alternation (`(AGENTS|CLAUDE|GEMINI)`) or written escaped
  (`AGENTS\.md`) is easy to miss in a rename; check that the project's names are
  the ones matched.

## Working cycle

`docs/guides/AGENT-WORKFLOW.md` governs the before and during of every change.
`docs/guides/TASK-COMPLETION.md` governs the end: build, lint, test, documentation, version, commit,
integration. `docs/guides/COMMITS.md` and `docs/guides/VERSIONING.md` are consumed by it.
No commit carries co-authorship or a mention of AI tools. The product setting
`general.gitCoAuthor` is unrelated: it governs the attribution the agent adds to commits it writes in
users' projects, not this repository's own commits, which carry no attribution lines.

Run one heavy job at a time — a build, a bundle or a full suite. Parallel runs exhaust the machine's
memory.

`main` is protected: every change reaches it through a pull request whose CI fast gates pass, with a
linear history. A change to the terminal interface follows `docs/guides/TUI-DESIGN.md`.

Autonomous rounds are triggered by `AUTORUN` and closed by `HALT`, per
`docs/guides/AUTONOMOUS-EXECUTION.md`. The first response after the trigger opens with the confirmation
line defined there. Nothing else activates the mode. State lives in `ops/`, which is ignored by git.

The container `SMOKE` gate does not apply: the product is a CLI installed via npm. This project's
smoke test is `node scripts/o1/smoke.mjs`.
