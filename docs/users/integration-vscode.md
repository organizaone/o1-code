# Visual Studio Code

The VS Code companion extension (beta) shows O1-Code's changes as they happen, in a panel inside the
editor.

### Features

- **Native IDE experience**: a dedicated O1-Code sidebar panel, opened from the O1-Code icon
- **Auto-accept edits mode**: apply O1-Code's changes as they are made
- **File management**: @-mention files, or attach files and images with the system file picker
- **Conversation history**: access past conversations
- **Multiple sessions**: run several O1-Code sessions at once

### Requirements

- VS Code 1.96.0 or later
- A clone of the O1-Code repository, set up as in the [Quickstart](./quickstart.md)

### Installation

The extension is not published to the Marketplace yet. Build it from the repository root:

```bash
npm run build:vscode
```

This writes a `.vsix` file to `packages/vscode-ide-companion/`. In VS Code, run **Extensions:
Install from VSIX...** from the command palette and pick that file.

## Troubleshooting

### Extension not installing

- Make sure you have VS Code 1.96.0 or later
- Check that VS Code has permission to install extensions

### O1-Code not responding

- Check your connection to your model provider
- Start a new conversation to see if the issue persists
- [File an issue on GitHub](https://github.com/organizaone/o1-code/issues) if the problem continues
