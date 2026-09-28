# o1-code

[![npm version](https://img.shields.io/npm/v/@organizaone/o1-code)](https://www.npmjs.com/package/@organizaone/o1-code)
[![npm downloads](https://img.shields.io/npm/dm/@organizaone/o1-code)](https://www.npmjs.com/package/@organizaone/o1-code)
[![Node.js](https://img.shields.io/node/v/@organizaone/o1-code)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/@organizaone/o1-code)](https://github.com/silvioricardo87/o1-code/blob/main/LICENSE)

An open-source AI coding agent for your terminal. o1-code reads your project, edits files, runs
commands and works through multi-step tasks, with the model provider you choose: any
OpenAI-compatible or Anthropic endpoint, given by its URL.

## Install

```bash
npm install -g @organizaone/o1-code
```

Requires Node.js 22 or later, on Windows, macOS or Linux. No administrator rights and no compiler.
To try it without installing, run `npx @organizaone/o1-code`.

## First run

```bash
cd your-project
o1-code
```

1. **Connect a provider.** On first launch you pick how to connect: OrganizaOne, an **API key** for a
   built-in provider (Anthropic, OpenAI, Google Gemini, DeepSeek, xAI and others), a **Local** server
   such as Ollama or LM Studio, detected on this machine, or a **Custom** URL for any
   OpenAI-compatible or Anthropic endpoint. Run `/auth` at any time to change it.
2. **Ask.** Describe a task in plain language:

   ```text
   explain the structure of this project
   add input validation to the signup form and write a test for it
   ```

3. **Approve.** o1-code shows what it is about to change or run and asks first. `Shift+Tab` switches
   the approval mode; `/help` lists the commands.

## What you get

- **Any provider by URL.** Built-in presets, local servers, or your own endpoint. Switch models
  at runtime with `/model`.
- **A full agent toolset.** File reads and edits, shell, search, web fetch, MCP servers and language
  servers (LSP).
- **Control over what runs.** Approval modes from plan-only to fully autonomous, trusted folders
  and an optional sandbox.
- **Extensible.** Skills, hooks, sub-agents, custom commands, output styles, themes and
  extensions.
- **Memory and context.** `AGENTS.md` project instructions, automatic memory, session resume and
  compaction.
- **Beyond the terminal.** Headless runs with `o1-code -p "..."`, the `o1-code serve` daemon with a
  browser Web Shell, and editor integration for VS Code, Zed and JetBrains IDEs.
- **Localized.** English and Brazilian Portuguese reviewed by hand, plus other locales.
- **No telemetry.** Nothing is collected; your prompts go only to the provider you configure.

## Learn more

- [Quickstart](https://github.com/silvioricardo87/o1-code/blob/main/docs/users/quickstart.md)
- [User documentation](https://github.com/silvioricardo87/o1-code/blob/main/docs/users/overview.md)
- [Model providers](https://github.com/silvioricardo87/o1-code/blob/main/docs/users/configuration/model-providers.md)
- [Changelog](https://github.com/silvioricardo87/o1-code/blob/main/CHANGELOG.md)
- [Report an issue](https://github.com/silvioricardo87/o1-code/issues)

## License

Apache-2.0. See
[LICENSE](https://github.com/silvioricardo87/o1-code/blob/main/LICENSE) and
[NOTICE](https://github.com/silvioricardo87/o1-code/blob/main/NOTICE).
