# Quickstart

This guide gets you from a fresh clone to your first coding session with O1-Code in a few minutes.

## Before you begin

Make sure you have:

- A **terminal** or command prompt open
- A code project to work with
- An API key for a model provider, or a local model server (Ollama, vLLM, LM Studio, or any
  OpenAI-compatible server)

## Step 1: Install O1-Code

You need Node.js 22 or later ([nodejs.org](https://nodejs.org/en/download)). Then install the
package globally:

```bash
npm install -g @organizaone/o1-code@latest
```

Check the installation with `o1-code --version`. To update later, run the same command again.

> [!note]
>
> If `o1-code` is not found, make sure npm's global binary directory (`npm prefix -g`) is in your
> `PATH`, then restart your terminal. To run an unreleased change instead, see
> [Build from source](../developers/build-from-source.md).

## Step 2: Connect a model provider

Start an interactive session. On first use you are asked to connect a provider:

```bash
o1-code
```

You can run `/auth` at any time to change it. The **Connect a provider** dialog opens on four
entries:

- **OrganizaOne** — connect to OrganizaOne with your key.
- **API key** — one alphabetical list of built-in providers connected with a key: Alibaba Cloud,
  Anthropic, DeepSeek, Google Gemini, Kimi (Moonshot), MiniMax, ModelScope, OpenAI, xAI and Z.AI.
- **Local** — models running on this machine: Ollama and LM Studio are detected on their ports
  (`● Ollama detected`), and any other local server is given by its port or URL. No key needed.
- **Custom** — any OpenAI-compatible or Anthropic endpoint, given by its base URL, an API key and
  the models you want. Use it for a proxy, a gateway, or any provider without a preset.

The key you enter is saved in `~/.o1-code/credentials/`, not in `settings.json`.

> [!note]
>
> To set up several providers and switch between them with `/model`, declare them under
> `modelProviders` in your `settings.json`; the API key is read from the environment variable each
> model names in `envKey`, never stored in settings. See
> [Model Providers](./configuration/model-providers.md) for the format.

> [!tip]
>
> Use `/doctor` to check your current configuration at any time. See the
> [Authentication](./configuration/auth.md) page for details.

## Step 3: Start your first session

Open your terminal in any project directory and start O1-Code:

```bash
# optional
cd /path/to/your/project
# start o1-code
o1-code
```

You'll see the O1-Code welcome screen with your session information, recent conversations, and latest updates. Type `/help` for available commands.

## Chat with O1-Code

### Ask your first question

O1-Code will analyze your files and provide a summary. You can also ask more specific questions:

```
explain the folder structure
```

You can also ask O1-Code about its own capabilities:

```
what can O1-Code do?
```

> [!note]
>
> O1-Code reads your files as needed - you don't have to manually add context. O1-Code also has access to its own documentation and can answer questions about its features and capabilities.

### Make your first code change

Now let's make O1-Code do some actual coding. Try a simple task:

```
add a hello world function to the main file
```

O1-Code will:

1. Find the appropriate file
2. Show you the proposed changes
3. Ask for your approval
4. Make the edit

> [!note]
>
> O1-Code always asks for permission before modifying files. You can approve individual changes or enable "Accept all" mode for a session.

### Use Git with O1-Code

O1-Code makes Git operations conversational:

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

You can also prompt for more complex Git operations:

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### Fix a bug or add a feature

O1-Code is proficient at debugging and feature implementation.

Describe what you want in natural language:

```
add input validation to the user registration form
```

Or fix existing issues:

```
there's a bug where users can submit empty forms - fix it
```

O1-Code will:

- Locate the relevant code
- Understand the context
- Implement a solution
- Run tests if available

### Test out other common workflows

There are a number of ways to work with O1-Code:

**Refactor code**

```
refactor the authentication module to use async/await instead of callbacks
```

**Write tests**

```
write unit tests for the calculator functions
```

**Update documentation**

```
update the README with installation instructions
```

**Code review**

```
review my changes and suggest improvements
```

> [!tip]
>
> **Remember**: O1-Code is your AI pair programmer. Talk to it like you would a helpful colleague - describe what you want to achieve, and it will help you get there.

## Essential commands

Here are the most important commands for daily use:

| Command               | What it does                                     | Example                       |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `o1-code`             | start O1-Code                                    | `o1-code`                     |
| `/auth`               | Change authentication method (in session)        | `/auth`                       |
| `/doctor`             | Check current authentication and environment     | `/doctor`                     |
| `/help`               | Display help information for available commands  | `/help` or `/?`               |
| `/compress`           | Replace chat history with summary to save Tokens | `/compress`                   |
| `/clear`              | Clear terminal screen content                    | `/clear` (shortcut: `Ctrl+L`) |
| `/theme`              | Change O1-Code visual theme                      | `/theme`                      |
| `/language`           | View or change language settings                 | `/language`                   |
| → `ui [language]`     | Set UI interface language                        | `/language ui pt-BR`          |
| → `output [language]` | Set LLM output language                          | `/language output Portuguese` |
| `/quit`               | Exit O1-Code immediately                         | `/quit` or `/exit`            |

See the [CLI reference](./features/commands.md) for a complete list of commands.

## Pro tips for beginners

**Be specific with your requests**

- Instead of: "fix the bug"
- Try: "fix the login bug where users see a blank screen after entering wrong credentials"

**Use step-by-step instructions**

- Break complex tasks into steps:

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Let O1-Code explore first**

- Before making changes, let O1-Code understand your code:

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Save time with shortcuts**

- Press `?` to see all available keyboard shortcuts
- Use Tab for command completion
- Press Ctrl+P for prompt history (with the input empty, ↑ scrolls the conversation)
- Type `/` to see all slash commands

## Getting help

- **In O1-Code**: Type `/help` or ask "how do I..."
- **Documentation**: You're here! Browse other guides
- **Community**: Join our [GitHub Discussion](https://github.com/organizaone/o1-code/discussions) for tips and support
