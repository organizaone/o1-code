# O1-Code Companion

Runs [O1-Code](https://github.com/organizaone/o1-code) inside Visual Studio Code: a chat panel,
changes reviewed in the native diff view, and the open file and selection shared as context. The
CLI is bundled, so nothing else needs to be installed.

Not yet published to the Marketplace or Open VSX. To install it, run `npm run build:vscode` at the
repository root, then **Extensions: Install from VSIX...** with the `.vsix` file written to
`packages/vscode-ide-companion/`. It needs VS Code 1.96 or newer, or an editor built on it.

Open the panel with the O1-Code icon in the editor title bar or `O1-Code: Open` in the Command
Palette. Report problems at [issues](https://github.com/organizaone/o1-code/issues). By installing
it you accept the [terms](https://github.com/organizaone/o1-code/blob/main/docs/users/support/tos-privacy.md).
Licensed under [Apache-2.0](https://github.com/organizaone/o1-code/blob/main/LICENSE).
