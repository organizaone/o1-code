# Zed Editor

Zed supports coding agents through the Agent Client Protocol (ACP). With it, you use O1-Code from
Zed's agent panel.

### Features

- **Native agent experience**: an AI assistant panel inside Zed
- **Agent Client Protocol**: full ACP support
- **File management**: @-mention files to add them to the conversation context
- **Conversation history**: access past conversations within Zed

### Requirements

- Zed (latest version recommended)
- The `o1-code` command on your `PATH` (see the [Quickstart](./quickstart.md))

### Installation

1. Install [Zed](https://zed.dev/).
2. In Zed, open the settings menu in the top right corner, select **Add agent**, choose **Create a
   custom agent**, and add this configuration:

```json
"O1-Code": {
  "type": "custom",
  "command": "o1-code",
  "args": ["--acp"],
  "env": {}
}
```

## Troubleshooting

### Agent not appearing

- Run `o1-code --version` in a terminal to verify the installation
- Check that the JSON configuration is valid
- Restart Zed

### O1-Code not responding

- Check your connection to your model provider
- Verify the CLI works by running `o1-code` in a terminal
- [File an issue on GitHub](https://github.com/silvioricardo87/o1-code/issues) if the problem persists
