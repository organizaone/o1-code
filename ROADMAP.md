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

### Remaining Windows process helpers

Windows sleep requests, browser opening and clipboard reads use optional native bindings to Windows
APIs, and standalone updates extract ZIP files in Node. Clipboard PNG/bitmap fixtures and the shipped
image worker pass after an isolated npm installation on Windows 11 ARM64 without an ARM64 Visual C++
runtime. These changes do not make every Windows feature independent of PowerShell. The following
fixed helpers remain until equivalent native behavior is demonstrated in supported Windows environments:

| Consumer                                             | Retained helper                                                         | Required parity before migration                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/tools/pid-descendants.ts`         | CIM process snapshot and per-PID start-time queries                     | Preserve descendant cleanup and PID reuse protection across exited or inaccessible processes; never treat a failed snapshot as an empty successful tree. |
| `packages/core/src/services/session-writer-lease.ts` | `Get-Process` UTC start ticks                                           | Preserve persisted `win32:<ticks>` identities and deny uncertain ownership so a recycled PID cannot create simultaneous session writers.                 |
| `packages/core/src/ide/process-utils.ts`             | CIM `CommandLine` query                                                 | Toolhelp snapshots provide names and parent PIDs, but cannot supply the command lines used by IDE discovery.                                             |
| `packages/cli/src/serve/native-directory-picker.ts`  | STA Windows Forms folder dialog                                         | Preserve interactive selection and cancellation; a new dialog/COM subsystem requires its own parity evaluation.                                          |
| `packages/cli/src/serve/local-path-open.ts`          | Fixed `Start-Process` terminal fallback when Windows Terminal is absent | Preserve existing-directory validation, bounded execution and passing the directory as environment data.                                                 |

Explicit PowerShell agent/hook selections and saved custom status commands remain supported.
Build-time Windows archive creation may still use fixed PowerShell helpers; it is separate from
the installed updater. Functional validation on ARM64 or x64 emulation does not establish native
Windows 10 x64 compatibility or compatibility with a corporate endpoint security policy.

### Windows release validation

The Windows execution changes have been exercised in the O1-Code Parallels guest on Windows 11
ARM64, including x64 Node under emulation. Installed npm and standalone packages acquired and
released native power requests without a PowerShell subprocess. Native Windows 10 x64 and
corporate endpoint-policy validation are deferred outside this task's acceptance scope.

Headless local-provider runs with Node 24.18.0 in this guest return the response and then fail at
shutdown with Node's `UV_HANDLE_CLOSING` assertion. The same failure reproduces with the pre-change
bundle and with optional native dependencies omitted; the matching x64 cases exit normally with
Node 22.23.3. Updating the guest through Scoop to Node 24.22.0 also restored clean headless
shutdown across the installed 0.19.2 shell/npm fixtures and native power probe, without a product
delay or exit workaround. Retain the older
runtime failure as regression evidence; a successful response alone does not establish a clean exit.
PowerShell discovery allows
ten seconds for startup after two-second probes rejected a runnable installation in the guest.
Git Bash retains normal MSYS native argument conversion, so `/flag` can become a path. Local
Windows Bash guidance and the smoke runner cover per-command `MSYS_NO_PATHCONV=1`; no global
conversion override is introduced. The runner also accepts a PowerShell 7 executable or its
registered Store alias. Test isolation preserves startup `USERPROFILE`, since changing it can
cause Store activation to fail even when the executable itself is runnable.

Core and terminal regression tests cover interrupted shell output in cancellation history,
paired tool responses after Esc, discarded completed outputs, and no automatic continuation.
Store discovery tests cover canonical package executables and workspace/module junction
exclusions. Installed 0.19.1 guest checks on Node 22 x64 confirmed registered Store alias and
type-only PowerShell 7 selection, scoped MSYS argument preservation, and Esc cancellation with
retained output and terminated fixture descendants in Bash, PowerShell 5.1 and PowerShell 7.6.7.
The native power acquire/release checks also exited cleanly. Dedicated installed-artifact fixtures
confirmed npm.cmd execution in all four shells and UNC working directories in PowerShell 5.1/7
and Git Bash with relative file arguments. Absolute Windows UNC arguments in Bash can acquire a
duplicated server/share prefix even with scoped MSYS conversion suppression; prefer relative paths.
CMD silently replaces UNC working directories with the Windows directory, so the execution service
now rejects those launches before PTY initialization or process creation, including structured CMD
launches.

Actual idle suspension could not be compared in this VM: a three-minute control without the CLI,
with temporarily reduced AC idle timeouts, remained Active in SleepStudy because Parallels Tools
held DISPLAY and SYSTEM requests. The original AC/DC settings were restored and verified. Native
API success establishes request acquisition/release, not physical sleep prevention in this setup.

### Connect a provider: the new login

The terminal and Web Shell provider dialogs have shipped, with four entry groups, a credential
store and local detection. The terminal also supports OrganizaOne account login and o1-gateway
connection codes (`AuthDialog.tsx`, `ProviderSetupSteps.tsx`). Account login and connection codes
remain disabled in the Web Shell (`serve/server/auth-provider-helpers.ts`).

- **Menu:** OrganizaOne; API key (one alphabetical list: Alibaba Cloud, Anthropic, DeepSeek,
  Google Gemini, Kimi, MiniMax, ModelScope, OpenAI, xAI, Z.AI); Local (Ollama and LM Studio detected on
  their ports, or another local server); Custom (any URL, OpenAI-compatible or Anthropic). The
  OpenRouter and Requesty presets go; Custom covers them.
- **OrganizaOne:** an API key against `api.organizaone.com`, account login through the browser
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

### Plugin and marketplace configuration

- The contextual slash menu and responsive selection panels are implemented.
  [Issue #53](https://github.com/organizaone/o1-code/issues/53) also covers the
  implemented individual plugin settings with user/project scope, inherited values
  and masked secret replacement, plus validated editing of marketplace sources.
  `/plugins` and `/plugin` open the existing extension manager.
  Evidence: `PluginSettingsView.test.tsx` checks scoped editing and secret privacy;
  `SourcesTab.test.tsx` checks bounded editors, pending/stale requests and retained
  actions; core extension settings/manager/registry tests check exact persistence
  and failed replacements. Real application captures are in
  `docs/images/tui-plugin-settings.png` and `docs/images/tui-marketplace-source-edit.png`.

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
| Telemetry to a third party appears in some path                   | low         | high   | OpenTelemetry is opt-in and uses the configured collector; review every new network endpoint    |
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

- a desktop app and a mobile shell (remote sessions, `/rc`, are not one: the terminal stays the
  only executor and the OrganizaOne gateway mirrors it to the account page in a browser);
- a browser extension, a browser tool and its CDP tunnel;
- computer use and a native driver for it;
- messaging channels;
- Java and Python SDKs;
- a GitHub Action integration;
- a second terminal renderer: Ink is the only one;
- a second project context file: `AGENTS.md` is the only one (`context.fileName` renames it);
- signing in with a consumer subscription of any model vendor.
