# Starter Extension Example

A complete, end-to-end O1-Code extension that demonstrates **every** building
block in a single package, themed around a small "writing companion". Use it as
a starting point when you want a relatively complete scaffold instead of an
empty extension.

```
starter/
├── o1-code-extension.json        # Manifest: name, version, context file, MCP servers
├── AGENTS.md                    # Context: persistent instructions for the model
├── agents/
│   └── diary.md               # Subagent: a focused diary-writing assistant
├── commands/
│   └── writing/
│       └── polish.md          # Custom command: /writing:polish
├── skills/
│   └── synonyms/
│       └── SKILL.md           # Skill: generate synonyms on demand
├── example.ts                 # MCP server source (tools + prompts)
├── package.json               # Build config for the MCP server
└── tsconfig.json
```

## What each piece does

| Capability | Where               | How it shows up                                          |
| ---------- | ------------------- | -------------------------------------------------------- |
| Context    | `AGENTS.md`         | Persistent instructions injected into every session.     |
| Subagent   | `agents/diary.md`   | Available via `/agents manage`.                          |
| Command    | `commands/writing/` | Invoked as `/writing:polish <text>`.                     |
| Skill      | `skills/synonyms/`  | Auto-activated via `/skills` when relevant.              |
| MCP server | `example.ts`        | Exposes a `count_words` tool and a `poem-writer` prompt. |

## Building the MCP server

The MCP server is written in TypeScript and must be compiled before it can run.
From the extension directory:

```bash
npm install
npm run build   # emits dist/example.js, which o1-code-extension.json points at
```

The other capabilities (context, agents, commands, skills) work without any
build step.

## Trying it out

```bash
o1-code extensions link /path/to/starter   # link this directory for local testing
```

Then restart O1-Code. The context loads automatically, `/writing:polish` and
`/skills` become available, the `diary-writer` subagent appears under
`/agents manage`, and (once built) the MCP `count_words` tool is callable.

See the [Getting Started with Extensions](https://github.com/silvioricardo87/o1-code/blob/main/docs/users/extension/getting-started-extensions.md)
guide for a deeper walkthrough.
