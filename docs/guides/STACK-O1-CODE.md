# o1-code stack

Stack document consumed by `TASK-COMPLETION.md`. It declares the cycle's commands and the code rules
of this repository. It is not a copy of `BACKEND-NODE.md`, because the toolchain here predates it. The
cross-cutting rules of that guide that apply are reproduced below with the reason they were adopted.

## Toolchain

Node >= 22 (`.nvmrc` pins 22; the maintainer's machine defaults to 26.9 through fnm), pnpm 11.24.0
through Corepack, strict TypeScript in ESM, Vitest, ESLint 9 in flat config, Prettier, esbuild for the
bundle. Corepack no longer ships with Node 26; install it with `npm i -g corepack`.

## Cycle commands

| Step | Command | Notes |
|---|---|---|
| 1 Build | `corepack pnpm install --frozen-lockfile && npm run build -- --cli-only` | A plain install: `prepare` only generates sources, and `postinstall` applies `patches/ink+7.0.3.patch`, without which `packages/cli` does not compile. Add `npm run bundle` when the change affects the publishable artifact |
| 2 Lint | `npm run lint && npm run typecheck` | Both. Typecheck after the build: the CLI checks against core's built types. The pre-commit hook runs Prettier and ESLint on staged files |
| 3 Test | `cd packages/<cli\|core> && npx vitest run <files in reach>`, and `node --test scripts/o1/*.test.mjs` for the project's scripts | Never `npx vitest` from the root: the configs are per package. Local runs cover the areas in reach; full CLI and core suites run only in CI, on demand, per `TASK-COMPLETION.md` |
| 5 Version | `npm run release:version -- <major\|minor\|patch>` | At the root. The root `package.json` version is the only one; the script aligns every workspace package to it |

Outside the cycle: `node scripts/o1/smoke.mjs` proves the bundle starts,
`node scripts/o1/provider-smoke.mjs` proves a provider configured by URL answers in both protocols,
`node scripts/o1/check-guides.mjs` proves the copied guides have not drifted from their source (and says it
skipped when that sibling checkout is absent), and
`node scripts/o1/brand-lint.mjs` fails on a third-party name used as identity on a user surface.

## Code rules

Kept for consistency across the tree: file names in `kebab-case.ts` and `PascalCase.tsx`, no `any`,
imports from `packages/core` through the module that defines the symbol rather than the package root,
tests next to the source, comments only where the why is not obvious.

Specific to `scripts/o1/`:

- Our tooling lives in `scripts/o1/`, in Node ESM, without dependencies, with built-in imports
  prefixed by `node:` and tests in `node:test`.
- **Never build a path from the working directory.** Anchor it on the module itself, through
  `fileURLToPath(import.meta.url)`. A project consuming these guides silently created a second, empty
  database by breaking this rule.
- **A tool script prints a one-line summary and exits non-zero when it finds something.** That is what
  lets it serve as a gate.
- **State the rejected approach in the header.** A tool that looks naive usually is not, and the next
  reader "simplifies" it back into the defect it avoids.

## Windows rules

Each one is an observed failure, not a hypothesis.

- `core.longpaths` on. Without it the checkout of this tree fails silently.
- LF line endings, enforced by `.gitattributes`. Stream editors rewrite whole files to CRLF and turn a
  one-line change into a whole-file diff.
- Never write code through a shell heredoc or `sed -i`: escapes and line endings arrive corrupted. Use
  the editing tools, or a script file.
- Resolve the interpreter's real path when a version manager is involved: the fnm shim is per shell
  and dies with the terminal.
- No East Asian Ambiguous glyph (`△`, `⚠`, `✔`, …) in a TUI row that can reach the full terminal
  width, even with VS15: Windows Terminal draws some of them two columns wide, the row wraps where
  Ink counts one, and every later repaint is off by a line (a stale bottom border when a dialog
  shrinks). Use ASCII or a glyph from `glyphs()`, whose set is checked in the real terminal.
- Some test failures are environmental on this machine and not defects: pt-BR number formatting
  (`12.000` for `12,000`), the Windows temp directory under `$HOME`, the drive root, git stash/force
  tests, TLS server names on Node 26. Re-run a failing file alone before judging it.

## Supply chain

The npm registry has been under sustained attack since late 2025, including a self-replicating worm.
These are not optional.

- The pinned pnpm version enforces its default cooldown for freshly published versions;
  do not exempt dependencies from it in `pnpm-workspace.yaml`.
- Versioned lockfile; installs use `--frozen-lockfile`.
- CI actions pinned by commit hash, not by a moving tag.

## See also

- `TASK-COMPLETION.md` — the cycle that consumes the commands above.
- `AGENT-WORKFLOW.md` — discipline before and during a change.
- `../../README.md` (Principles) and `../../ROADMAP.md` — what the product is and what comes next.
