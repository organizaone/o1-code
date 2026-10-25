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
- Windows x64/Arm64, macOS Intel/Apple Silicon, or Linux x64

### Installation

Run `/ide install` from O1-Code in VS Code's integrated terminal. The CLI downloads the companion
for its own release version and your platform from [GitHub releases](https://github.com/organizaone/o1-code/releases),
verifies its SHA-256 checksum, and installs it using the editor's command-line tool.

The extension is not published to the Marketplace yet. To install manually, download the matching
`.vsix` release asset and choose **Extensions: Install from VSIX...**. VSIX installations do not
receive Marketplace updates automatically; run `/ide install` again after updating the CLI.

To build a local package from a repository checkout:

```bash
npm run build:vscode
```

This writes a platform-specific `.vsix` file and `.sha256` checksum to `packages/vscode-ide-companion/`. In VS Code, run **Extensions:
Install from VSIX...** from the command palette and pick that file.

## Troubleshooting

### Extension not installing

- Make sure you have VS Code 1.96.0 or later
- Check that VS Code has permission to install extensions
- Check that the CLI release has a VSIX for your platform and that GitHub downloads are reachable
- Ensure `code` is on PATH; `/ide install` reports the original download or installation error

### O1-Code not responding

- Check your connection to your model provider
- Start a new conversation to see if the issue persists
- [File an issue on GitHub](https://github.com/organizaone/o1-code/issues) if the problem continues
