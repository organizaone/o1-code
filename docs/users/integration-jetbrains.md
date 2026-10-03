# JetBrains IDEs

JetBrains IDEs support coding agents through the Agent Client Protocol (ACP). With it, you use
O1-Code from the IDE's AI Chat tool window.

### Features

- **Native agent experience**: an AI assistant panel inside your JetBrains IDE
- **Agent Client Protocol**: full ACP support
- **Symbol management**: #-mention files to add them to the conversation context
- **Conversation history**: access past conversations within the IDE
- **Reasoning effort**: choose Default, Low, Medium, High, Extra high, or Max from the agent's
  session options; each provider maps or clamps the requested tier for the active model
- **Context usage**: see the current context-window occupancy while O1-Code works

### Requirements

- A JetBrains IDE with ACP support (IntelliJ IDEA, WebStorm, PyCharm, and others)
- The `o1-code` command installed (see the [Quickstart](./quickstart.md))

### Installation

1. Open your JetBrains IDE and go to the AI Chat tool window.
2. Open the three-dot menu in the upper-right corner, select **Configure ACP Agent**, and add
   O1-Code:

```json
{
  "agent_servers": {
    "o1-code": {
      "command": "/path/to/o1-code",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

3. The O1-Code agent is now available in the AI Assistant panel.

## Troubleshooting

### Agent not appearing

- Run `o1-code --version` in a terminal to verify the installation
- Make sure your JetBrains IDE version supports ACP
- Restart your JetBrains IDE

### O1-Code not responding

- Check your connection to your model provider
- Verify the CLI works by running `o1-code` in a terminal
- [File an issue on GitHub](https://github.com/organizaone/o1-code/issues) if the problem persists
