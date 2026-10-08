# O1-Code Extensions

O1-Code extensions package prompts, MCP servers, subagents, skills and custom commands into a familiar and user-friendly format. With extensions, you can expand the capabilities of O1-Code and share those capabilities with others. They are designed to be easily installable and shareable.

Extensions and plugins in other formats — Claude Code plugins ([Claude Code Marketplace](https://claudemarketplaces.com/)), `gemini-extension.json` extensions, Qoder plugins, and the portable [Agent Plugins v1](./agent-plugins.md) format — can be installed into O1-Code directly, so extension authors do not need to maintain separate versions.

## Extension management

Extensions are managed with both `o1-code extensions` CLI commands and the `/extensions`, `/plugins` or `/plugin` slash commands within the interactive CLI.

### Runtime Extension Management (Slash Commands)

You can manage extensions at runtime within the interactive CLI. The manager refreshes its lists after changes. Plugin parameter edits are saved for the next startup; restart the application to apply them.

| Command                                                      | Description                                                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `/extensions`, `/extensions manage`, `/plugins` or `/plugin` | Manage installed extensions and marketplace sources                                                  |
| `/extensions install <source>`                               | Install an extension from a git URL, local path or archive, archive URL, npm package, or marketplace |
| `/extensions explore [source]`                               | Open an extensions marketplace page (`Gemini`, `ClaudeCode`, `Codex`, or `Grok`) in your browser     |

#### The interactive extension manager

Running `/extensions` (or its aliases `/plugins` and `/plugin`) opens an interactive manager with three tabs. Press `Tab` or the `←`/`→` arrows to switch between them when a child editor is not active.

- **Discover** — browse plugins from your configured marketplace sources. Type to search, `Enter` to view a plugin's details, and install it (you'll be asked to choose an install scope). Press `Ctrl+R` to re-fetch the listings, and `Esc` to go back.
- **Installed** — your installed extensions, grouped by scope (**User level**, **Project level**, and favorites). Use `↑`/`↓` to navigate, `Space` to enable/disable an extension, `f` to favorite it, and `Enter` to open its details. MCP servers bundled by an extension appear nested under their parent extension with live connection status; you can enable or disable each server individually from there.
- **Sources** — manage the marketplace sources that feed the Discover tab. Use `↑`/`↓` to navigate, `Enter` to select a source, and `d` to remove one. These are the same sources managed by the `o1-code extensions sources` CLI commands described below.

#### Plugin parameters

Open an installed plugin's details and select **Plugin settings**. This action appears for plugins that declare settings in their manifest; field names and descriptions come from that manifest. Disabled plugins can be configured without enabling them.

Use `↑`/`↓` to select a field, `Enter` to edit, and `Tab` outside the editor to switch between **User** and **Project** values. Project settings inherit User values when there is no project override. An explicitly empty non-sensitive Project value overrides the User value. Parameter scope is separate from the plugin's activation scope.

Sensitive fields show only whether a value is configured. Their replacement input starts empty and stays masked; empty `Enter` never clears a saved secret. `Esc` cancels without writing. `Enter` saves an explicit replacement in the selected scope. Restart the application to apply parameter changes.

#### Editing marketplace sources

On **Sources**, open a store and choose **Edit source** to replace its URL, repository or local path. **Update marketplace** refreshes the current source and remains a separate action. Editing is also available when a store fails to load.

The replacement is validated before the registry changes. Validation or persistence failure keeps the original entry; a successful replacement preserves its added date and does not retarget installed plugins. Other stores remain unchanged.

Private source URLs are redacted, and their replacement input starts empty. Re-enter the full replacement; sensitive input stays masked. `Esc` keeps the original source, and `Enter` saves. While saving and reopening the store, navigation stays locked and a progress message remains visible. Long input shows its visible line range instead of hiding the controls.

### CLI Extension Management

You can also manage extensions using `o1-code extensions` CLI commands. Note that changes made via CLI commands will be reflected in active CLI sessions on restart.

### Installing an extension

You can install an extension using `o1-code extensions install` from multiple sources:

#### From Claude Code Marketplace

O1-Code also supports plugins from the [Claude Code Marketplace](https://claudemarketplaces.com/). Install from a marketplace and choose a plugin:

```bash
o1-code extensions install <marketplace-name>
# or
o1-code extensions install <marketplace-github-url>
```

If you want to install a specific plugin, you can use the format with plugin name:

```bash
o1-code extensions install <marketplace-name>:<plugin-name>
# or
o1-code extensions install <marketplace-github-url>:<plugin-name>
```

For example, to install the `prompts.chat` plugin from the [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) marketplace:

```bash
o1-code extensions install f/awesome-chatgpt-prompts:prompts.chat
# or
o1-code extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude plugins are automatically converted to O1-Code format during installation:

- `claude-plugin.json` is converted to `o1-code-extension.json`
- Agent configurations are converted to O1-Code subagent format
- Skill configurations are converted to O1-Code skill format
- Tool mappings are automatically handled

You can quickly browse available extensions from different marketplaces using the `/extensions explore` command:

```bash
# Open the gemini-extension.json marketplace
/extensions explore Gemini

# Open Claude Code marketplace
/extensions explore ClaudeCode

# Open the Codex plugins page
/extensions explore Codex

# Open the Grok Build plugin marketplace
/extensions explore Grok
```

This command opens the respective marketplace in your default browser, allowing you to discover new extensions to enhance your O1-Code experience.

#### From `gemini-extension.json` extensions

Extensions whose manifest is a `gemini-extension.json` install from their git URL:

```bash
o1-code extensions install <extension-github-url>
# or
o1-code extensions install <owner>/<repo>
```

These extensions are converted to O1-Code format during installation:

- `gemini-extension.json` is converted to `o1-code-extension.json`
- TOML command files are automatically migrated to Markdown format
- MCP servers, context files, and settings are preserved

#### From Qoder Plugins

O1-Code supports [Qoder plugins](https://docs.qoder.com/en/cli/sdk/plugins) that contain a `.qoder-plugin/plugin.json` manifest. Install a local directory, archive, Git repository, archive URL, or scoped npm package with the existing `o1-code extensions install` command:

```bash
o1-code extensions install ./sample-qoder-plugin
o1-code extensions install ./sample-qoder-plugin.zip
o1-code extensions install owner/sample-qoder-plugin
```

The installer converts the Qoder manifest to `o1-code-extension.json` and preserves standard `commands/`, `agents/`, and `skills/` directories. MCP servers declared in a root `.mcp.json` file are included as extension MCP servers.

When a Qoder plugin contains `system-prompt.md` at its root, O1-Code loads it as extension context. If the plugin also contains `AGENTS.md` or declares other context files, all context files are retained and deduplicated.

#### From Codex Plugins

O1-Code supports [Codex plugins](https://developers.openai.com/codex/plugins) that contain a `.codex-plugin/plugin.json` manifest. Install a local directory, archive, Git repository, or archive URL:

```bash
o1-code extensions install ./sample-codex-plugin
o1-code extensions install owner/sample-codex-plugin
```

A Codex marketplace lists its plugins in `.agents/plugins/marketplace.json`. Install from it and choose a plugin, or name the plugin directly:

```bash
o1-code extensions install owner/codex-marketplace
o1-code extensions install owner/codex-marketplace:sample-plugin
```

The installer converts the manifest to `o1-code-extension.json`:

- `skills/`, `commands/`, `agents/`, and hooks are handled as for Claude Code plugins
- `interface.displayName` becomes the extension's display name, and `interface.longDescription` or `interface.shortDescription` fills a missing `description`
- MCP servers are read from `mcpServers` (inline or a file path) or from a root `.mcp.json`
- `${PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` in hook commands resolve to the installed extension

The rest of `interface` (icons, colors, screenshots, default prompts) is presentation only and is dropped. App integrations (`apps`) are not supported and are skipped. A Codex plugin whose root `plugin.json` declares the Agent Plugins v1 `$schema` installs through [Agent Plugins v1](#from-agent-plugins-v1) instead.

#### From Grok Build Plugins

O1-Code supports [Grok Build plugins](https://github.com/xai-org/plugin-marketplace) that contain a `.grok-plugin/plugin.json` manifest. Install a local directory, archive, Git repository, or archive URL:

```bash
o1-code extensions install ./sample-grok-plugin
o1-code extensions install owner/sample-grok-plugin
```

A Grok Build marketplace lists its plugins in `.grok-plugin/marketplace.json`. Install from it and choose a plugin, or name the plugin directly:

```bash
o1-code extensions install xai-org/plugin-marketplace
o1-code extensions install xai-org/plugin-marketplace:sample-plugin
```

The manifest and directory layout follow Claude Code's, so the installer converts them the same way: `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, and a root `.mcp.json` are preserved, and `${GROK_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` in hook commands resolve to the installed extension. Marketplace entries pinned to a commit `sha` are cloned at that commit. Language servers (`.lsp.json` or `lspServers`) are not supported and are skipped.

A plugin selected from a Grok Build or Codex marketplace may carry its manifest in `.claude-plugin/plugin.json`, `.grok-plugin/plugin.json`, or `.codex-plugin/plugin.json`; the first one found, in that order, is used. Like Claude Code marketplace plugins, these update by reinstalling.

#### From Agent Plugins v1

O1-Code natively loads portable Agent Plugins v1 packages without converting or rewriting `plugin.json`, `mcp.json`, or `SKILL.md` files:

```bash
o1-code extensions install ./my-agent-plugin
o1-code extensions link ./my-agent-plugin
o1-code extensions install owner/my-agent-plugin
```

The portable runtime supports Agent Skills plus stdio and Streamable HTTP MCP servers. Commands, agents, hooks, client namespaces, and legacy SSE MCP are not activated. See [Agent Plugins v1](./agent-plugins.md) for the complete support matrix.

#### From npm Registry

O1-Code supports installing extensions from npm registries using scoped package names. This is ideal for teams with private registries that already have auth, versioning, and publishing infrastructure in place.

```bash
# Install the latest version
o1-code extensions install @scope/my-extension

# Install a specific version
o1-code extensions install @scope/my-extension@1.2.0

# Install from a custom registry
o1-code extensions install @scope/my-extension --registry https://your-registry.com
```

Only scoped packages (`@scope/package-name`) are supported to avoid ambiguity with the `owner/repo` GitHub shorthand format.

**Registry resolution** follows this priority:

1. `--registry` CLI flag (explicit override)
2. Scoped registry from `.npmrc` (e.g. `@scope:registry=https://...`)
3. Default registry from `.npmrc`
4. Fallback: `https://registry.npmjs.org/`

**Authentication** is handled automatically via the `NPM_TOKEN` environment variable or registry-specific `_authToken` entries in your `.npmrc` file.

> **Note:** npm extensions must include either a native `o1-code-extension.json` or an Agent Plugins v1 `plugin.json` at the package root. See [Extension Releasing](./extension-releasing.md#releasing-through-npm-registry) for packaging details.

#### From Git Repository

Git 2.37 or newer is required for credentialed, non-GitHub, nested marketplace, submodule, and Git LFS sources because O1-Code uses `http.curloptResolve` to pin Git connections to validated DNS results. On older Git versions, O1-Code supports only anonymous public `https://github.com/{owner}/{repo}[.git]` root repositories by resolving the requested ref to a commit and downloading GitHub's source archive with the same public-network and archive-safety checks.

Because the older-Git fallback installs from a source archive rather than a clone, it cannot install repositories that rely on submodules or Git LFS, and it caps downloads at 100 MiB compressed and archives at 100,000 entries / 1 GiB expanded / 8 MiB path metadata, including files materialized from at most 100 symlinks. Symlinks directly targeting regular files in the repository are supported on systems that permit symlink creation; Windows may require Developer Mode or elevated privileges. The fallback rejects directory, chained, dangling, absolute, escaping, hard, and POSIX literal-backslash-target links. Other Agent Plugin install paths continue to omit symlinks. Release-based installs are still preferred when a repository publishes releases.

```bash
o1-code extensions install https://github.com/github/github-mcp-server
```

This will install the github mcp server extension.

#### From Local Path

```bash
o1-code extensions install /path/to/your/extension
```

Local `.zip` and `.tar.gz` archives are also supported:

```bash
o1-code extensions install /path/to/your/extension.zip
o1-code extensions install /path/to/your/extension.tar.gz
```

The archive must contain a complete extension at its root, or a single top-level directory containing the extension.

Note that we create a copy of the installed extension, so you will need to run `o1-code extensions update` to pull in changes from both locally-defined extensions and those on GitHub.

#### From Archive URL

```bash
o1-code extensions install https://example.com/your/extension.zip
o1-code extensions install https://example.com/your/extension.tar.gz
```

Archive URLs can be updated later as long as the URL continues to point at a newer archive for the same extension.

#### Choosing an install scope

By default, an installed extension is enabled globally (user scope). Pass `--scope project` to enable it only for the current workspace:

```bash
o1-code extensions install <source> --scope project
```

`--scope workspace` is accepted as an alias of `--scope project`. This matches the scope choice offered when installing from the `/extensions manage` Discover tab.

### Managing marketplace sources

Marketplace sources (Claude plugin marketplaces) power the Discover tab in `/extensions manage`. You can manage them from the CLI as well:

```bash
# Add a marketplace (owner/repo, git URL, https URL to marketplace.json, or local path)
o1-code extensions sources add <source>

# List configured marketplaces
o1-code extensions sources list

# Re-fetch a marketplace's plugin listing
o1-code extensions sources update <name>

# Remove a marketplace
o1-code extensions sources remove <name>
```

### Uninstalling an extension

To uninstall, run `o1-code extensions uninstall extension-name`, so, in the case of the install example:

```
o1-code extensions uninstall o1-code-cli-security
```

### Disabling an extension

Extensions are, by default, enabled across all workspaces. You can disable an extension entirely or for specific workspace.

For example, `o1-code extensions disable extension-name` will disable the extension at the user level, so it will be disabled everywhere. `o1-code extensions disable extension-name --scope=workspace` will only disable the extension in the current workspace.

### Enabling an extension

You can enable extensions using `o1-code extensions enable extension-name`. You can also enable an extension for a specific workspace using `o1-code extensions enable extension-name --scope=workspace` from within that workspace.

This is useful if you have an extension disabled at the top-level and only enabled in specific places.

### Updating an extension

For extensions installed from a local path or archive, an archive URL, a git repository, or an npm registry, you can explicitly update to the latest version with `o1-code extensions update extension-name`. For npm extensions installed without a version pin (e.g. `@scope/pkg`), updates check the `latest` dist-tag. For those installed with a specific dist-tag (e.g. `@scope/pkg@beta`), updates track that tag. Extensions pinned to an exact version (e.g. `@scope/pkg@1.2.0`) are always considered up-to-date.

You can update all extensions with:

```
o1-code extensions update --all
```

## How it works

On startup, O1-Code looks for extensions in `<home>/.o1-code/extensions`

Native O1-Code extensions exist as a directory that contains a `o1-code-extension.json` file. Agent Plugins v1 packages instead retain their root `plugin.json`; see [Agent Plugins v1](./agent-plugins.md).

For example, a native O1-Code extension is stored at:

`<home>/.o1-code/extensions/my-extension/o1-code-extension.json`

### `o1-code-extension.json`

The `o1-code-extension.json` file contains the configuration for the extension. The file has the following structure:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "contextFileName": "AGENTS.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "workflows": "workflows",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: The name of the extension. This is used to uniquely identify the extension and for conflict resolution when extension commands have the same name as user or project commands. The name should be lowercase or numbers and use dashes instead of underscores or spaces. This is how users will refer to your extension in the CLI. Note that we expect this name to match the extension directory name.
- `version`: The version of the extension.
- `mcpServers`: A map of MCP servers to configure. The key is the name of the server, and the value is the server configuration. These servers will be loaded on startup just like MCP servers configured in a [`settings.json` file](../configuration/settings.md). If both an extension and a `settings.json` file configure an MCP server with the same name, the server defined in the `settings.json` file takes precedence.
  - Note that all MCP server configuration options are supported except for `trust`.
- `contextFileName`: The name of the file that contains the context for the extension. This will be used to load the context from the extension directory. If this property is not used but an `AGENTS.md` file is present in your extension directory, then that file will be loaded.
- `commands`: The directory containing custom commands (default: `commands`). Commands are `.md` files that define prompts.
- `skills`: The directory containing custom skills (default: `skills`). Skills are discovered automatically and become available via the `/skills` command.
- `agents`: The directory containing custom subagents (default: `agents`). Subagents are `.yaml` or `.md` files that define specialized AI assistants.
- `workflows`: A directory, or a list of directories and `.js` files, containing workflow scripts (default: `workflows`). See [Custom workflows](#custom-workflows).
- `settings`: An array of settings that the extension requires. When installing, users will be prompted to provide values for these settings. The values are stored securely and passed to MCP servers as environment variables.
  - Each setting has the following properties:
    - `name`: Display name for the setting
    - `description`: A description of what this setting is used for
    - `envVar`: The environment variable name that will be set
    - `sensitive`: Boolean indicating if the value should be hidden (e.g., API keys, passwords)

### Managing Extension Settings

Extensions can require configuration through settings (such as API keys or credentials). These settings can be managed using the `o1-code extensions settings` CLI command:

**Set a setting value:**

```bash
o1-code extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**List all settings and current values for an extension:**

```bash
o1-code extensions settings list <extension-name>
```

Settings can be configured at two levels:

- **User level** (default): Settings apply across all projects (`~/.o1-code/.env`)
- **Workspace level**: Settings apply only to the current project (`.o1-code/.env`)

Workspace settings take precedence over user settings. Sensitive settings are stored securely and never displayed in plain text.

When O1-Code starts, it loads all the extensions and merges their configurations. If there are any conflicts, the workspace configuration takes precedence.

### Custom commands

Extensions can provide [custom commands](../features/commands.md#4-custom-commands) by placing Markdown files in a `commands/` subdirectory within the extension directory. These commands follow the same format as user and project custom commands and use standard naming conventions.

> **Note:** The command format has been updated from TOML to Markdown. TOML files are deprecated but still supported. You can migrate existing TOML commands using the automatic migration prompt that appears when TOML files are detected.

**Example**

An extension named `gcp` with the following structure:

```
.o1-code/extensions/gcp/
├── o1-code-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

Would provide these commands:

- `/deploy` - Shows as `[gcp] Custom command from deploy.md` in help
- `/gcs:sync` - Shows as `[gcp] Custom command from sync.md` in help

### Custom skills

Extensions can provide custom skills by placing skill files in a `skills/` subdirectory within the extension directory. Each skill should have a `SKILL.md` file with YAML frontmatter defining the skill's name and description.

**Example**

An extension named `gcp` with the following structure:

```
.o1-code/extensions/gcp/
├── o1-code-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md   # frontmatter: name: pdf-processor
```

provides one skill, registered as `gcp:pdf-processor` — the extension's `name`, a colon, then the name the `SKILL.md` authors. Run it with `/gcp:pdf-processor`; `/skills` lists it and labels it with the extension's display name, falling back to its `name` when the manifest declares none.

Unlike the extension's custom commands, which are named after their files (`/deploy` and `/gcs:sync` above, and prefixed only when one collides — see Conflict resolution below), an extension skill always carries its owner: two extensions that both ship a `pdf-processor` give you two skills instead of one shadowing the other. The prefix is added as the skill loads, so the `name` in your `SKILL.md` is never rewritten on disk.

Settings that name skills treat the two spellings asymmetrically: `skills.disabled` blocks a skill under either name, while `skills.enabled` opts it in under the prefixed name only. See [Extension Skills](../features/skills.md#extension-skills).

### Custom subagents

Extensions can provide custom subagents by placing agent configuration files in an `agents/` subdirectory within the extension directory. Agents are defined using YAML or Markdown files.

**Example**

```
.o1-code/extensions/my-extension/
├── o1-code-extension.json
└── agents/
    └── testing-expert.yaml
```

Extension subagents appear in the subagent manager dialog under "Extension Agents" section.

### Custom workflows

Extensions can ship workflow scripts by placing `.js` files in a `workflows/` subdirectory, or in the directories and files the manifest lists in `workflows`. They appear only when Workflows are enabled with the [`tools.workflowsEnabled`](../configuration/settings.md) setting, which is off by default; the install consent prompt lists them either way.

**Example**

An extension named `gcp` with the following structure:

```
.o1-code/extensions/gcp/
├── o1-code-extension.json
└── workflows/
    └── deep-research.js
```

provides one workflow when its script declares a static `meta` object with `name: 'deep-research'`, registered as `gcp:deep-research` — the extension's `name`, a colon, then `meta.name`. Run it with `/gcp:deep-research`, call it from another workflow with `workflow('gcp:deep-research')`, or let the model run it by name with `Workflow({ name: 'gcp:deep-research' })`. Like an extension skill, an extension workflow always carries its owner, so it never shadows one of your project or user workflows. If the same extension also ships a skill with that name, the skill keeps `/gcp:deep-research` and the workflow's slash command is renamed to `/gcp.gcp:deep-research`, as for any colliding extension command; a `slashCommands.disabled` entry written as `gcp:deep-research` still removes both. A user or project custom command with the same name (for example `commands/gcp/deep-research.md`) loads last and takes the slash command, and the workflow then stays reachable through `workflow('gcp:deep-research')`.

Each script must declare a static `export const meta = { name, description }` block. The `description` is shown in the install consent prompt and in the command list. The file name may differ from `meta.name`; calls always use the metadata name. If multiple scripts declare the same `meta.name`, the first discovered script is kept. A `description` longer than 500 characters is shortened wherever it is shown.

A script can also declare `whenToUse`, a sentence saying when the workflow applies:

```js
export const meta = {
  name: 'deep-research',
  description: 'Researches a question across the codebase and the web',
  whenToUse:
    'When the user asks for a sourced, multi-angle answer to an open question',
};
```

Only a workflow that declares `whenToUse` is listed for the model, together with its description, so the model can start it when a request matches; each run still goes through the workflow approval. Without it, the model does not see the workflow, which then runs when you invoke it, ask for it by name, or another workflow calls it. `whenToUse` is shortened past 500 characters, like `description`, and since it lives in the script, changing it makes the next update ask for consent again.

In the interactive UI, `/gcp:deep-research` starts the workflow directly. In headless mode and over ACP, the same command asks the model to run it by name, and the approval follows.

To let the model start your extension's workflows without letting it write and run scripts of its own, deploy with [`tools.workflowNameOnly`](../configuration/settings.md) (or `O1CODE_WORKFLOW_NAME_ONLY=1`) and allow the workflows by name, for example `Workflow(name:gcp:deep-research)`. The lock makes every run the model starts addressable by such a rule; it does not approve anything by itself, so keep asking for names you have not allowed.

Discovery is deliberately narrow:

- Only `.js` files directly inside each directory are read; subdirectories are ignored.
- `meta.name` must use lower-case letters, digits, and hyphens, start with a letter, and contain at most 41 characters.
- Every declared path must stay inside the extension directory. A linked extension (`o1-code extensions link`) skips symlinked workflow files and directories; an installed extension is a copy in which each symlink has already been replaced by the file it points to.
- Scripts larger than 256 KiB, or without a valid `meta` block, are skipped with a warning.

Installing an extension lists its workflows in the consent prompt. An update asks again when it adds or removes a workflow, changes a workflow's name or description, or changes a script's code; when only code changed, the prompt names the changed scripts. Extension workflows follow the same rules as your own saved workflows: they are hidden in untrusted folders and in bare mode, and each run goes through the usual workflow approval, which shows the start of the script. An "always allow" for a workflow run by name or path is saved as a rule pinned to the script's content, such as `Workflow(name:gcp:deep-research,sha256:3f2a9c1d0b4e5f67)`, so it stops applying once the script changes. A rule you write without `sha256`, such as `Workflow(name:gcp:deep-research)`, allows every version of the script.

Edits to files in the default `workflows/` directory are picked up automatically. Changes under other declared paths take effect after `/reload-plugins` or a restart.

Claude Code plugins that ship workflows are converted on install. A plugin that declares no `workflows` keeps its `workflows/` directory, which is discovered as the default. When the plugin declares `workflows`, the declared files retain their relative paths and are listed explicitly in the converted extension's manifest, and only those files are discovered: files with the same basename in different directories stay distinct under their `meta.name` values, and a `workflows/` directory the plugin also ships is copied but not read. A symlink inside a declared directory is copied as a regular file when its target stays inside the plugin.

### Conflict resolution

Extension commands have the lowest precedence. When a conflict occurs with user or project commands:

1. **No conflict**: Extension command uses its natural name (e.g., `/deploy`)
2. **With conflict**: Extension command is renamed with the extension prefix (e.g., `/gcp.deploy`)

For example, if both a user and the `gcp` extension define a `deploy` command:

- `/deploy` - Executes the user's deploy command
- `/gcp.deploy` - Executes the extension's deploy command (marked with `[gcp]` tag)

## Variables

O1-Code extensions allow variable substitution in `o1-code-extension.json`. This can be useful if e.g., you need the current directory to run an MCP server using `"cwd": "${extensionPath}${/}run.ts"`.

**Supported variables:**

| variable                   | description                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | The fully-qualified path of the extension in the user's filesystem e.g., '/Users/username/.o1-code/extensions/example-extension'. This will not unwrap symlinks. |
| `${workspacePath}`         | The fully-qualified path of the current workspace.                                                                                                               |
| `${/} or ${pathSeparator}` | The path separator (differs per OS).                                                                                                                             |
