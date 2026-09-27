# o1-code

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

o1-code is an open-source AI coding agent for the terminal. It reads your project, edits files, runs
commands and works through multi-step tasks, with the model provider of your choice.

## Install

Nothing is published to npm yet. Build from source:

```bash
git clone https://github.com/silvioricardo87/o1-code.git
cd o1-code
git config core.longpaths true   # needed on Windows
corepack pnpm install --frozen-lockfile
npm run build -- --cli-only
npm run bundle
npm link                         # puts `o1-code` on your PATH
```

Requires Node.js 22 or later and Corepack. Node 26 no longer ships Corepack: install it with
`npm i -g corepack`. [`AGENTS.md`](./AGENTS.md) lists every build and test command.

## Quick start

```bash
cd /path/to/your-project
o1-code
```

On first launch, run `/auth` and connect a provider. Pick a built-in provider, or choose **Custom
Provider** and give any OpenAI-compatible or Anthropic endpoint by its base URL, an API key and the
models you want. Then ask something:

```text
Explain this repository and show me where to start.
```

To keep several providers and switch with `/model`, declare them under `modelProviders` in
`~/.o1-code/settings.json`. See [Authentication](./docs/users/configuration/auth.md) and
[Model providers](./docs/users/configuration/model-providers.md).

## What it does

- **Any provider by URL.** OpenAI-compatible and Anthropic protocols, built-in presets, local
  servers such as Ollama or vLLM. Switch models at runtime.
- **Agent tools.** File reads and edits, shell, search, web fetch, MCP servers, LSP.
- **Control over what runs.** Approval modes (plan, default, auto-edit, auto, yolo), trusted
  folders and an optional sandbox.
- **Extensible.** Skills, hooks, sub-agents, custom commands, output styles, themes and extensions.
- **Memory and context.** `AGENTS.md` context files, automatic memory, session resume and
  compaction.
- **Beyond the TUI.** Headless runs with `o1-code -p "..."`, the `o1-code serve` daemon with its Web
  Shell, a TypeScript SDK in this repository, and editor integration over ACP and the VS Code
  companion.
- **Localized interface.** English and Brazilian Portuguese reviewed by hand, plus other locales.

The user documentation is in [`docs/users/`](./docs/users/overview.md).

## Principles

- **The terminal is the product.** The Web Shell, the SDK and the editor integrations serve it.
- **Any provider by URL is first-class.** An OpenAI-compatible or Anthropic endpoint, given by
  its base URL and a key, is never a second-class path.
- **Runs as a user.** No administrator rights, no Rust or Go toolchain; native modules are prebuilt
  or optional. Windows is a first-class platform.
- **No telemetry.** Nothing is collected; OpenTelemetry export exists only when you configure it.
- **Extension mechanisms first.** Skills, hooks, MCP, rules, output styles, themes and
  `modelProviders` before changes to the core.
- **Apache-2.0, respected.** `LICENSE`, `NOTICE` and third-party copyright headers are kept.

What comes next is in [`ROADMAP.md`](./ROADMAP.md).

## Privacy

o1-code collects no usage data. Your prompts and code go to the model provider you configure, and to
an OpenTelemetry collector only if you set one up. See [Terms of service and privacy](./docs/users/support/tos-privacy.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Security issues go through [SECURITY.md](./SECURITY.md).

## License

Apache-2.0, see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
