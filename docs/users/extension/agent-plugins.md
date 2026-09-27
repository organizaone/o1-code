# Agent Plugins v1

O1-Code natively loads portable [Agent Plugins v1](https://agent-plugins.org/)
packages. The package keeps its standard `plugin.json`, `mcp.json`, and
`SKILL.md` files: installation does not generate `o1-code-extension.json` or
rewrite portable files.

Use the existing extension commands with a local directory, link, archive,
Git repository, archive URL, or scoped npm package:

```bash
o1-code extensions install ./my-agent-plugin
o1-code extensions link ./my-agent-plugin
o1-code extensions install owner/my-agent-plugin
```

The root manifest must target the canonical v1 schema:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-agent-plugin",
  "version": "1.0.0"
}
```

## Supported capabilities

| Capability                          | Support                                  |
| ----------------------------------- | ---------------------------------------- |
| Direct-child `skills/*/SKILL.md`    | Yes                                      |
| stdio MCP servers                   | Yes                                      |
| Streamable HTTP MCP servers         | Yes                                      |
| Legacy HTTP+SSE MCP servers         | No; the entry is skipped                 |
| Commands, agents, and hooks         | No; these directories are ignored        |
| Workflows                           | No; the directory is ignored             |
| O1-Code context, settings, and apps | No                                       |
| `extensions.*` client namespaces    | No; unimplemented namespaces are ignored |

Skills follow the [Agent Skills specification](https://agentskills.io/specification).
An invalid skill is skipped without disabling valid sibling skills. The
experimental `allowed-tools` field is recognized as a string but does not grant
pre-approved O1-Code tools.

For stdio MCP servers, O1-Code expands `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`
once in `args`, environment values, and `cwd`. `PLUGIN_DATA` is a writable
per-installation directory whose contents persist across updates and reinstall.
Remote MCP endpoints must use HTTPS, except for loopback HTTP endpoints.

Agent Plugins v1 is a package format, not a marketplace integration. Install
packages through O1-Code's existing extension sources.
