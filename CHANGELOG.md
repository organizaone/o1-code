# Changelog

All notable changes to o1-code are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-09-28

### Terminal interface

- An update of O1-Code stands out: a framed notice says it was installed and applies on the next
  run, or why it failed, instead of a plain status line. The first run of a new version shows
  what is new in it, with a link to the full release notes.
- The input keeps its borders aligned in GNOME Terminal and Ptyxis: the right border no longer
  moves one column in when the cursor is at the end of the line, and a session name set with
  `/rename` no longer breaks the top border.

## [0.2.1] - 2026-09-28

### Terminal interface

- A message you sent now stands apart from the reply and the tool rows: a brand-coloured bar runs
  down every line of it and its text is brand soft, instead of the same colour as everything else.
- `/model` sets the reasoning effort along with the model: ←/→ move along `default` and the
  tiers the highlighted model takes, and Enter applies both.
- `/effort` offers `default` first, which clears the saved tier so the model/provider decides;
  `/effort default` does the same. The effort picker is translated to Portuguese.
- The text in the input can be selected by dragging over it, like the conversation, and is copied
  on release. A click without a drag still places the cursor.
- While monitors run, the activity line shows `● monitoring (N)` next to `info`, `reading` and the
  others. While background work runs, the first ↑ from an empty input focuses it, with
  `enter open · ↑ history · esc back`; Enter opens the dialog, and ↑ goes on into history. ↓ no
  longer goes up to them. `/tasks` opens the same dialog instead of printing a list.

### Fixed

- Search works again after installing from npm. 0.2.0 shipped its bundled ripgrep without the
  execute permission, so every start warned "Ripgrep not available … EACCES" and fell back to the
  slower built-in grep. The package ships the binary executable again, the release refuses a
  tarball where it is not, and an install of 0.2.0 repairs itself on the next start.
- Connecting a provider: when checking the key timed out or hit a network error, the model step
  opened with no list and only going back to the key brought it. The model step now asks the
  provider again on its own, `ctrl+r` reloads the list at any time (the models already checked
  stay checked), and a list that cannot be read says so at the top of the step.

### OrganizaOne

- Requests to the OrganizaOne proxy name the agent: `X-Title: o1-code` and an `O1Code/<version>`
  User-Agent, instead of presenting as Claude CLI on the Anthropic protocol.
- The reasoning effort reaches the proxy on the OpenAI protocol as well: it is sent as
  `reasoning_effort`, the field the proxy reads, instead of a nested field it ignored.
- Connecting a provider keeps the reasoning efforts each model declares in the model list
  (`reasoning.efforts` and `reasoning.default`; a Claude CLI model of the proxy takes every level),
  which is what sends the effort in the field the proxy reads. Providers connected before this
  release get it by connecting again with `/auth`.
- The footer shows `reasoning default` for a model that takes an effort when none was chosen.

### Documentation

- Every install instruction uses `@organizaone/o1-code@latest`, and the troubleshooting FAQ
  explains the automatic update and `/update` instead of rebuilding a clone.
- The npm package declares its Apache-2.0 license, and the README drops the badges a private
  repository cannot serve.

## [0.2.0] - 2026-09-28

### Terminal interface

- The message that started a turn shows the turn's state in its prefix column: a spinner while
  the agent has shown nothing yet, `❯` with `…` after the text once something appears, and `✓`
  when the turn ends. A cancelled or failed turn leaves `❯`.

### Documentation

- The README opens on what o1-code is and how to install it from npm, with a screenshot of the
  start screen and links to the feature documentation; building from source moved to
  `docs/developers/build-from-source.md`.
- The npm package ships its own README (`packages/cli/README.md`), written for the registry page.
- The Quickstart, the overview, the troubleshooting page and the uninstall page install from npm
  instead of a clone.

## [0.1.0] - 2026-09-27

The first release of o1-code, a coding agent for the terminal.

### Terminal interface

- A layout with a header (logo and shortcuts), the conversation, and an input and footer fixed at
  the bottom. The footer shows the approval mode, model and reasoning level, the git branch and
  diff, context use, turn tokens and turn time, and the request status.
- Adapts to the terminal width, down to under 80 columns, and falls back to plain symbols where the
  terminal cannot draw them. One cursor at the insertion point, Windows included.
- Tool calls, approvals, lists, dialogs, the start screen, provider retries and errors share one
  design. Queued messages show inside the conversation.
- Dark and light themes, a pixel logo, and an icon: the "O1" symbol at small sizes and "O1" over
  "CODE" from 48 px up. The logo animates once on the start screen (eight animations,
  `ui.logoAnimation` picks one, `random` by default, `off` disables).
- The interface follows the system language: English, Portuguese, Chinese, Traditional Chinese,
  German, French, Japanese, Russian and Catalan.

### Connect a provider

- Four entries: OrganizaOne, API key (one alphabetical list: Alibaba Cloud, Anthropic, DeepSeek,
  Google Gemini, Kimi, MiniMax, ModelScope, OpenAI, xAI, Z.AI), Local (Ollama and LM Studio
  detected on their ports, or another local server) and Custom (any URL, OpenAI-compatible or
  Anthropic). The Web Shell offers the same.
- API keys live in `~/.o1-code/credentials/`, one file per provider, never in `settings.json`;
  `o1-code auth logout <provider-id>` forgets a saved key.
- The API key is checked with the provider before moving on. A refused key stays on its step with
  the reason; pressing enter again on it moves on anyway, for keys that can chat but cannot list
  models.
- The models step lists what the provider serves (Gemini included), with search, checkboxes and a
  field for other IDs; ctrl+r asks again when the list cannot be read and keeps what was chosen.

### Agent

- Reads and edits files, runs commands, searches the web, and asks for approval according to the
  approval mode.
- Skills, hooks, MCP servers, subagents, extensions and custom commands. Installs extensions from
  Claude Code, Gemini, Qoder, Codex and Grok Build plugins and their marketplaces.
- `/commit` turns the working tree into one commit per logical change, in the repository's own
  message style, and asks before each commit; it never pushes. `/finish` closes a change: build,
  lint, scoped tests, a docs check and the version step when the project declares one; it reports
  what ran and what did not, and hands over to `/commit`.
- Goals stop repeating a failed fix (a rethink after the second failure, a new strategy on the
  fourth, then a block report with options and one closed question), commit per verifiable slice
  and never push unless allowed, name a scope change instead of absorbing it, and an approved plan
  can be run as a Goal from the plan dialog.
- The system prompt carries eight working-discipline rules: stop and rethink after a second failed
  fix, search every reference form on a rename, check references before deleting, watch long
  operations, sub-agent hygiene, edit with the editing tools, leave shared stateful resources
  alone, and scope test runs to the change.
- `o1-code -p` runs one prompt headless, for scripts and CI.
- `o1-code serve` runs a local daemon with a REST API and the Web Shell, a browser interface.
- Editor companions for VS Code and Zed.

[Unreleased]: https://github.com/silvioricardo87/o1-code/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/silvioricardo87/o1-code/releases/tag/v0.1.0
