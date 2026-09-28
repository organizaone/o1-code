# Changelog

All notable changes to o1-code are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
