# Roadmap

What is in the tree and its state, what comes next, and what is out of scope. Delivered work is in
[`CHANGELOG.md`](./CHANGELOG.md); the rules are in [`AGENTS.md`](./AGENTS.md).

## Packages

All under `@organizaone/o1-code-*`, versioned together with the CLI.

| Package                                 | What it is                                                               | Status              | Pending                                                            |
| --------------------------------------- | ------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------ |
| `packages/cli` (`@organizaone/o1-code`) | The `o1-code` binary, TUI, commands, `serve` daemon                      | **active**          | —                                                                  |
| `packages/core`                         | Agent loop, tools, providers, extensions, hooks, skills, MCP             | **active**          | —                                                                  |
| `packages/acp-bridge`                   | Agent Client Protocol core (editors)                                     | dependency          | —                                                                  |
| `packages/web-shell`                    | Web interface for `o1-code serve`                                        | **active**          | Its own documentation                                              |
| `packages/web-templates`                | Embedded web templates (includes the HTML export)                        | dependency          | —                                                                  |
| `packages/sdk-typescript`               | TypeScript SDK for programmatic use of the CLI                           | dependency          | Publish if it is ever offered                                      |
| `packages/node-repl`                    | MCP server with a persistent Node REPL                                   | dependency          | —                                                                  |
| `packages/audio-capture`                | Native microphone capture (optional)                                     | optional dependency | Publish alongside the CLI, or voice falls back to SoX/arecord      |
| `packages/vscode-ide-companion`         | VS Code extension (publisher `organizaone`)                              | to evaluate         | Marketplace publication                                            |
| `packages/zed-extension`                | Zed editor extension                                                     | to evaluate         | Update the pinned 0.1.0 tarball and evaluate extension publication |
| `integrations/external-context`         | External context extension, reference for "extend without touching core" | to evaluate         | —                                                                  |
| `integrations/external-context-mem0`    | Mem0-compatible variant                                                  | to evaluate         | —                                                                  |

The container sandbox (`packages/cli/src/config/sandboxConfig.ts`) stays available and off by
default. Publication of its configured image, `ghcr.io/organizaone/o1-code`, remains pending;
the release workflow publishes the npm package and GitHub release only.

## Next

In this order.

### Connect a provider: the new login

The terminal and Web Shell provider dialogs have shipped, with four entry groups, a credential
store and local detection. The terminal also supports OrganizaOne account login and o1-gateway
connection codes (`AuthDialog.tsx`, `ProviderSetupSteps.tsx`). Account login and connection codes
remain disabled in the Web Shell (`serve/server/auth-provider-helpers.ts`).

- **Menu:** OrganizaOne; API key (one alphabetical list: Alibaba Cloud, Anthropic, DeepSeek,
  Google Gemini, Kimi, MiniMax, ModelScope, OpenAI, xAI, Z.AI); Local (Ollama and LM Studio detected on
  their ports, or another local server); Custom (any URL, OpenAI-compatible or Anthropic). The
  OpenRouter and Requesty presets go; Custom covers them.
- **OrganizaOne:** an API key against `api.organizago.com`, account login through the browser
  (device code, RFC 8628), or an `o1gw1.` connection code in the terminal. The Web Shell supports
  the API key; account login and connection codes remain marked as "coming soon" there.
- **Credentials:** one file per provider under `~/.o1-code/credentials/`, owner-only; keys no
  longer live in `settings.json`.
- **Models:** always listed by the provider (Gemini included); a built-in list only where a
  provider cannot list them.

### npm publication

Decisions so far.

- Only the CLI package, `@organizaone/o1-code`, is published for now. `audio-capture` leaves its
  `optionalDependencies` until a prebuild pipeline exists (done: `prepare:package` lists it only
  with `O1CODE_PACKAGE_AUDIO_CAPTURE=1`); voice falls back to SoX/arecord. The SDK, the Web Shell
  and the Node REPL are published only when offered.
- The npm org `organizaone` exists and the maintainer owns it.
- Done: `.github/workflows/release.yml`, triggered by a `vX.Y.Z` tag (plus manual dispatch):
  checks that the tag matches the root and CLI versions and has a changelog section, restores
  the CI build for the tagged commit or builds and bundles as a fallback, runs `prepare:package`
  and brand lint and both smoke checks, packs and installs
  the tarball in a clean prefix and runs it, publishes the tarball with `--access public` and
  creates the GitHub release from the changelog section (`scripts/o1/release-notes.mjs`). The steps
  are in the deviations of `docs/guides/VERSIONING.md`. An already-published npm version skips
  publication while the workflow repairs or completes its GitHub release.
- Stable channel only: every tag goes to `latest`.
- The first publications (0.1.0 to 0.2.1) used a temporary granular `NPM_TOKEN` secret; releases
  now publish through trusted publishing (OIDC) configured on npmjs.com, with provenance, since the
  repository is public.
- Done: the first npm publication was `@organizaone/o1-code@0.1.0`, with the GitHub release `v0.1.0`.
- Still open: a prebuild pipeline for `audio-capture`, which then returns to the published
  package.

### Unscheduled

- A `/smoke` skill (container smoke gate), user-invoked only.
- Stack profiles as installable extensions of conditional rules, principles without version pins.
- "Approve and run as a Goal" in the Web Shell and ACP clients (the plan options are shared ids
  across the ACP bridge, the session, the permission utilities and the Web Shell panel).
- The Web Shell's own documentation.

## Known gaps

- A few tests are load-sensitive and fail only when the full suites share the machine; each passes
  on its own: `server.test.ts` (organized session truncation), core `recall-scan-latency.test.ts`
  (a 50 ms budget) and `code-mode.test.ts`, Web Shell `BranchPickerPopover` (focus after a
  workspace switch); `acp-http/transport.test.ts` can leave an unhandled `fetch failed` under load.
  CI runs the full suites only on demand.
- `integration-tests/globalSetup.test.ts` times out outside the integration environment.
- The Web Shell e2e smoke needs WebKit installed; its shell-card clipboard check compares text that
  differs only in line endings on Windows.
- A marketplace whose plugin source is the marketplace root leaves an empty `plugin<hash>`
  directory in the installed extension (cosmetic).

## Risks

| Risk                                                              | Probability | Impact | Mitigation                                                                                      |
| ----------------------------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------------------------------------- |
| `patches/ink+7.0.3.patch` conflicts with an Ink upgrade           | medium      | medium | upgrade Ink deliberately, with the patch reviewed in the same change                            |
| Node requirement rises                                            | medium      | medium | track `engines`; document the supported version; install Node per user (nvm, fnm)               |
| Heavy build and test (3–4 GB heap, large monorepo) on one machine | medium      | medium | scoped tests; `--cli-only`; hosted CI for the full suites; one heavy job at a time              |
| Windows: long paths, CRLF, shell scripts                          | high        | low    | `core.longpaths`, `.gitattributes`, scripts in Node                                             |
| npm supply chain attacks                                          | medium      | high   | `minimumReleaseAge` cooldown, frozen lockfile, hash-pinned actions                              |
| A third-party name appears as product identity                    | low         | high   | `node scripts/o1/brand-lint.mjs` as a gate; docs and README review before publishing            |
| Telemetry to a third party appears in some path                   | low         | high   | no collection module in the tree; review every new network endpoint                             |
| Single maintainer                                                 | medium      | high   | small, scoped changes; CI gates on every pull request; this file and the changelog kept current |

## Repository governance

- `main` is protected: no direct push, not even for admins; linear history; no force push or
  deletion.
- Changes come in through a pull request, using `.github/pull_request_template.md`, with
  conversations resolved before merge; no mandatory approving review, because there is a single
  maintainer.
- Two workflows: `.github/workflows/o1-ci.yml` (the fast checks, `Fast gates`, on every pull
  request to `main`, mandatory; the full suites on demand) and `release.yml` (a `vX.Y.Z` tag
  publishes to npm). Both run on GitHub-hosted runners; a fork pull request runs the same checks
  once the maintainer approves its workflow run. A few tests are skipped because they assert on
  review workflows this repository does not run.
- Upstream base: the tree last matched the upstream project's `main` in the middle of its 0.24.5
  cycle (2026-09-23). Upstream is a source of bug reports and ideas, never a merge target: a fix
  found there is read in this code first and reimplemented with its own test, and a feature gets
  an evaluation card (`CONTRIBUTING.md`). The next survey starts from that point.

## Out of scope

Not in the tree; they do not come back without a maintainer decision (`AGENTS.md`, rule 4):

- a desktop app and a mobile shell;
- a browser extension, a browser tool and its CDP tunnel;
- computer use and a native driver for it;
- messaging channels;
- Java and Python SDKs;
- a GitHub Action integration;
- a second terminal renderer: Ink is the only one;
- a second project context file: `AGENTS.md` is the only one (`context.fileName` renames it);
- signing in with a consumer subscription of any model vendor.
