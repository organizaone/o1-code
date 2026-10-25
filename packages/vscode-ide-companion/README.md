# O1-Code Companion

Runs [O1-Code](https://github.com/organizaone/o1-code) inside Visual Studio Code: a chat panel,
changes reviewed in the native diff view, and the open file and selection shared as context. The
CLI is bundled, so nothing else needs to be installed.

Install it with `/ide install` from the CLI in VS Code's integrated terminal, or download the
matching platform VSIX from [GitHub releases](https://github.com/organizaone/o1-code/releases)
and use **Extensions: Install from VSIX...**. It is not yet published to the Marketplace or Open VSX.
After updating the CLI, run `/ide install` again to update the companion.

For a local build, run `npm run build:vscode` at the repository root. The platform-specific VSIX
and its SHA-256 checksum are written to `packages/vscode-ide-companion/`. It needs VS Code 1.96 or newer.

Open the panel with the O1-Code icon in the editor title bar or `O1-Code: Open` in the Command
Palette. Report problems at [issues](https://github.com/organizaone/o1-code/issues). By installing
it you accept the [terms](https://github.com/organizaone/o1-code/blob/main/docs/users/support/tos-privacy.md).
Licensed under [Apache-2.0](https://github.com/organizaone/o1-code/blob/main/LICENSE).
