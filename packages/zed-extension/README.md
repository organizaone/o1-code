# O1-Code for Zed

Registers [O1-Code](https://github.com/organizaone/o1-code) as an agent server in
[Zed](https://zed.dev), over the [Agent Client Protocol](https://agentclientprotocol.com).

Not yet published: the extension is not in Zed's registry, and it downloads the npm release of
`o1-code`, which does not exist yet. Until then, add O1-Code to Zed as a custom agent server that
runs the `o1-code --acp` command you built from source; the steps are in
[Zed integration](../../docs/users/integration-zed.md). It needs Node.js 22 or later.

The agent reads its model and authentication from `~/.o1-code/settings.json`. When something fails,
**Zed: Open Log** and **Dev: Open ACP Logs** show what happened; report it at
[issues](https://github.com/organizaone/o1-code/issues). Licensed under Apache-2.0; see
[LICENSE](LICENSE) and [NOTICE](NOTICE).
