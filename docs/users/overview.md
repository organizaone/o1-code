# O1-Code overview

O1-Code is an AI coding agent that lives in your terminal. It reads your project, edits files, runs
commands and works through multi-step tasks, with the model provider you choose.

## Get started

Install O1-Code from npm (Node.js 22 or later), then start it in a project:

```bash
npm install -g @organizaone/o1-code
cd your-project
o1-code
```

The [Quickstart](./quickstart.md) walks through the first session.

On first launch you are asked to connect a model provider: a built-in provider with an API key, or a
**Custom** provider given by its base URL (any OpenAI-compatible or Anthropic endpoint, including a
local server). Then ask about your code:

```
what does this project do?
```

> [!tip]
>
> See [troubleshooting](./support/troubleshooting.md) if you hit issues.

## What O1-Code does for you

- **Build features from descriptions**: describe what you want in plain language. O1-Code makes a
  plan, writes the code, and checks that it works.
- **Debug and fix issues**: describe a bug or paste an error message. O1-Code analyzes your
  codebase, finds the problem, and implements a fix.
- **Navigate any codebase**: ask anything about your codebase. O1-Code reads your project as needed,
  can fetch information from the web, and with [MCP](./features/mcp.md) can pull from external data
  sources.
- **Automate tedious tasks**: fix lint issues, resolve merge conflicts, write release notes, from
  your machine or in CI with [headless mode](./features/headless.md).
- **[Followup suggestions](./features/followup-suggestions.md)**: O1-Code predicts what you want to type
  next and shows it as ghost text. Press Tab to accept, or keep typing to dismiss.

## How it works

- **Works in your terminal**: O1-Code runs where you already work, with the tools you already use.
  It also runs in [VS Code](./integration-vscode.md), [Zed](./integration-zed.md),
  [JetBrains IDEs](./integration-jetbrains.md) and a browser through `o1-code serve`.
- **Takes action**: O1-Code edits files, runs commands, and creates commits, asking for approval as
  your [approval mode](./features/approval-mode.md) requires. [MCP](./features/mcp.md) connects it to your
  own tools.
- **Composable and scriptable**: `tail -f app.log | o1-code -p "tell me if you see anomalies in this
log stream"` works, and so does `o1-code -p "..."` in a CI job.
