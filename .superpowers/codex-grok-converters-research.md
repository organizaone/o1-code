# Research: adding Codex and Grok Build plugin converters

Scope: how the existing extension converters work (Claude, Gemini, Qoder, and the portable
Agent Plugins v1 path), and what the public documentation says about OpenAI Codex plugins and
xAI Grok Build plugins, as of 2026-09-26. Everything under "Part 2" comes from external
documentation (cited) rather than this repository, and several points there could not be
pinned down to a single authoritative source — those are marked **unconfirmed**.

## Part 1 — how the existing converters work

### Entry point and detection order

`packages/core/src/extension/extension-converter.ts` — `convertCompatibleExtension()` is the
single dispatcher. It runs an `if / else if` chain, in this exact order, over one
`extensionDir`:

```ts
export const SUPPORTED_EXTENSION_MANIFESTS = [
  EXTENSIONS_CONFIG_FILENAME, // o1-code-extension.json
  'gemini-extension.json',
  '.claude-plugin/marketplace.json',
  '.claude-plugin/plugin.json',
  QODER_PLUGIN_MANIFEST, // .qoder-plugin/plugin.json
] as const;
```

1. **Agent Plugins v1** (`getAgentPluginSchemaStatus(extensionDir)`, from
   `agent-plugins-v1/manifest.ts`) — checked _first_, but only when no explicit `pluginName`
   was given. It reads a root `plugin.json` and checks its `$schema` field against
   `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` (prefix
   `https://agent-plugins.org/schemas/`). Match → `'supported'` → `originSource = 'AgentPlugins'`,
   loaded natively, **no conversion at all** (no rewrite of `plugin.json`, `mcp.json`,
   `SKILL.md`). A schema URL under the same prefix but a different version → `'unsupported'`
   → hard error. No `$schema` field, or file absent → `'unrelated'`, falls through.
2. `o1-code-extension.json` exists at the root → already native, `originSource = 'O1Code'`,
   directory unchanged.
3. `isGeminiExtensionConfig(extensionDir)` → `convertGeminiExtensionPackage()` →
   `originSource = 'Gemini'`.
4. **`pluginName` was passed explicitly** (i.e. `owner/repo:pluginName` install syntax) →
   `convertClaudePluginPackage()` (the marketplace flow). The comment in the code is explicit
   about why this precedes plain root-manifest detection: "An explicit marketplace selection
   must win over root-manifest detection: a repo can carry both a marketplace and a root
   plugin manifest, and silently substituting the latter installs different content than the
   one selected." After conversion, if the result directory happens to also satisfy the Agent
   Plugins v1 schema, that manifest is deleted (`fs.rmSync(... AGENT_PLUGIN_MANIFEST ...)`) so
   the two formats can't collide. `originSource = 'Claude'`.
5. `.qoder-plugin/plugin.json` exists → `convertQoderPlugin()` → `originSource = 'Qoder'`.
6. `.claude-plugin/plugin.json` exists (standalone, no marketplace.json) →
   `convertClaudePluginStandalone()` → `originSource = 'Claude'`.
7. None matched → directory returned unchanged (assumed native or fails downstream validation).

Return shape from `convertCompatibleExtension`:

```ts
{
  extensionDir: string;
  originSource: ExtensionOriginSource;
  externalContent: boolean;
}
```

`ExtensionOriginSource` (packages/core/src/config/config.ts:811-816):

```ts
export type ExtensionOriginSource =
  | 'O1Code'
  | 'Claude'
  | 'Gemini'
  | 'Qoder'
  | 'AgentPlugins';
```

**A Codex/Grok converter needs to extend this union** (e.g. add `'Codex' | 'Grok'`) and add two
more branches to the `if/else if` chain in `extension-converter.ts`, each guarded by its own
manifest-detection function (mirroring `isGeminiExtensionConfig` / the Qoder
`fs.existsSync(QODER_PLUGIN_MANIFEST)` check). `originSource` flows generically almost
everywhere downstream (see "i18n" below), so extending the union is most of the UI-facing work.

`ExtensionConfig` (packages/core/src/extension/extensionManager.ts:188-209) is the converter's
output shape — every converter must produce (or leave `undefined`) exactly these fields:

```ts
export interface ExtensionConfig {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  _rawLocalizable?: {
    displayName?: LocalizableString;
    description?: LocalizableString;
  };
  mcpServers?: Record<string, MCPServerConfig>;
  lspServers?: string | Record<string, unknown>;
  contextFileName?: string | string[];
  commands?: string | string[];
  skills?: string | string[];
  skillStates?: Record<string, boolean>;
  agents?: string | string[];
  workflows?: string | string[];
  settings?: ExtensionSetting[];
  hooks?: { [K in HookEventName]?: HookDefinition[] };
}
```

### What each existing converter maps

**Claude (`packages/core/src/extension/claude-converter.ts`, ~1290 lines, the reference
implementation; Qoder is a thin wrapper around it)**

- `ClaudePluginConfig` (plugin.json): `name`, `version`, `description`, `author`, `homepage`,
  `repository`, `license`, `keywords`, `commands`, `agents`, `skills`, `hooks`, `mcpServers`,
  `workflows`, `outputStyles`, `lspServers`. `commands`/`agents`/`skills` may each be a string
  or string array of paths (files or directories); collected into `tmpDir/commands`,
  `tmpDir/skills`, `tmpDir/agents` by `collectResources()` — a directory whose basename equals
  the destination folder name (`./commands/`) is flattened; a subfolder name is preserved
  (`./skills/xlsx` → `skills/xlsx/`).
- **Agents**: `ClaudeAgentConfig` (subagent Markdown frontmatter) — `name`, `description`,
  `tools`, `disallowedTools`, `model`, `permissionMode`, `skills`, `hooks`, `mcpServers`,
  `systemPrompt` (body), `color`. `convertAgentFiles()` rewrites every `.md` under `agents/`:
  parses frontmatter, remaps and rewrites it, keeps body as `systemPrompt`.
  - Tool name mapping (`CLAUDE_TOOLS_MAPPING`): `Bash→Shell`, `Read→ReadFile`,
    `Write→WriteFile`, `LS→ListFiles`, `TodoWrite→TodoList`, `NotebookEdit`, `Grep`, `Glob`,
    `WebFetch`, `WebSearch`, `Task`, `Skill`, `AskUserQuestion`, `ExitPlanMode` pass through
    unchanged in name; `BashOutput` and `KillShell` map to `'None'` and are dropped.
  - `permissionMode` mapping: `default→default`, `plan→plan`, `acceptEdits→auto-edit`,
    `dontAsk→default` (deliberately _not_ `auto-edit`, to preserve the restrictive intent),
    `bypassPermissions→yolo`, `auto→auto-edit`.
- **Skills**: no explicit remap function found beyond being copied as directories (Claude
  `SKILL.md` frontmatter is compatible enough to pass through as-is); the collection logic in
  `collectResources` is the extent of the "skills" handling.
- **Hooks**: `HookEventName`/`HookDefinition` from `../hooks/types.js`. A `hooks` value that is
  a string is treated as a relative file path, resolved with `resolvePluginRelativeFile`, JSON
  parsed, unwrapped if it has a `{ hooks: {...} }` shape, then run through
  `substituteHookVariables(hooksData, pluginSource)` (from `./variables.ts`) which does a
  literal regex replace of `${CLAUDE_PLUGIN_ROOT}` with the plugin's absolute installed path
  inside every hook `command` string.
- **MCP servers**: `normalizeClaudeMcpServer()` maps Claude's `.mcp.json` shape (transport
  discriminated by a `type` field: `'http' | 'sse' | 'stdio'`) onto o1-code's shape (transport
  discriminated by _which key is present_: `httpUrl` for streamable HTTP, `url` for SSE,
  `command` for stdio). A Claude `type: 'http'` entry has its `url` renamed to `httpUrl`; any
  other `type` value is stripped, except `'sdk'` which o1-code reserves and always keeps
  (`isSdkMcpServerConfig` depends on it). `mcpServers` as a string path (`.mcp.json`) is read
  and JSON-parsed by `convertClaudePluginStandalone`/`buildO1CodeExtensionFromPlugin`.
- **Skipped / warned**: `outputStyles` is explicitly unsupported — "Output styles are not yet
  supported in {name}" (debug warning only, field dropped). `mcpServers` as a string inside
  `convertClaudeToO1CodeConfig` itself (the marketplace-merge path, as opposed to the
  file-resolution path in `buildO1CodeExtensionFromPlugin`) logs "MCP servers path not yet
  supported" — effectively a TODO, dead code path in practice since
  `buildO1CodeExtensionFromPlugin` resolves the string first.
- **Workflows**: `collectWorkflowResources()` — if the manifest declares `workflows` (string or
  array of `.js` files or directories), each file's _relative path is preserved_ (not
  flattened) so same-named files in different directories don't collide, and the converted
  manifest lists them explicitly (`o1codeConfig.workflows = workflowPaths`). Un-declared,
  the copied `workflows/` directory is discovered by the default convention instead.
- **Variable substitution**: only `${CLAUDE_PLUGIN_ROOT}` (hooks) is substituted at
  conversion time (see `variables.ts:86-160`, also used for MCP server config — grep shows a
  second call site around line 126/148 doing the same substitution for MCP/other config, not
  just hooks). The general `${extensionPath}` / `${workspacePath}` / `${/}` /
  `${pathSeparator}` variables are a _native_ o1-code-extension.json feature
  (`performVariableReplacement`, resolved at load time for every extension, not specific to
  any converter) — see docs quote below.
- **Security/symlink hardening** (relevant precedent for a new converter): every manifest read
  goes through `realPathWithin()` (refuse a manifest that's a symlink resolving outside the
  package); every relative resource path from an untrusted manifest goes through
  `resolvePluginRelativeFile()` (rejects absolute paths and `../` escapes, both lexically and
  via `realPathWithin` for symlink targets); `sanitizeForError`/`stripAnsiAndControl` scrubs
  untrusted strings (source URLs, paths) before they're interpolated into thrown error
  messages, since conversion errors surface in the TUI install status area.
- **Marketplace plugin `source` resolution** (`resolvePluginSource`): four shapes —
  a plain string that's either an `http(s)://` URL (download release, fall back to git clone)
  or a path relative to the marketplace dir (confined with the same escape checks); or an
  object: `{ source: 'github', repo }`, `{ source: 'url', url }`, or
  `{ source: 'git-subdir', url, path, ref?, sha? }` (clones the repo pinned to `sha` or `ref`,
  then confines `path` to the clone). `externalContent` is `true` whenever content was fetched
  from outside the marketplace repo itself (github/url/git-subdir), so the marketplace clone's
  commit no longer describes exactly what was installed.

**Gemini (`packages/core/src/extension/gemini-converter.ts`)** — much smaller surface:

- `GeminiExtensionConfig`: `name`, `version` (both required), `mcpServers`, `contextFileName`
  (string or string[]), `settings` (`ExtensionSetting[]`) — mapped near 1:1 onto
  `ExtensionConfig`.
- Commands: `.toml` files under `commands/` are converted to Markdown
  (`convertTomlToMarkdown`) and the original `.toml` deleted; everything else copied as-is.
- No hooks, no agents, no skills concept in Gemini's format — none of those fields exist on
  `GeminiExtensionConfig`.
- Detection heuristic (`isGeminiExtensionConfig`): manifest must have string `name` + `version`;
  additionally, if `settings` is an array and its first entry has an `envVar` field, that's
  extra confirmation, but the function returns `true` for any object with `name`+`version`
  regardless (a permissive heuristic — this file also hosts the shared `copyDirectory` /
  `isPathWithin` / `realPathWithin` symlink-safety primitives that both Claude and Qoder
  converters import).

**Qoder (`packages/core/src/extension/qoder-converter.ts`)** — a thin adapter that reuses
Claude's `buildO1CodeExtensionFromPlugin` verbatim:

- `QODER_PLUGIN_MANIFEST = '.qoder-plugin/plugin.json'`.
- `QoderPluginConfig` = `ClaudePluginConfig` with `version` made optional (defaults to
  `'1.0.0'`) plus two extra fields: `displayName`, `contextFileName`.
- MCP servers: inline object, string path (custom resolution, tries with/without an
  `{ mcpServers: {...} }` wrapper), or default `.mcp.json` at the plugin root if the manifest
  declares nothing.
- Context files: `resolveContextFiles()` — collects the manifest's declared
  `contextFileName`(s), then always appends `system-prompt.md` if present, then (only if
  there's already at least one context file) prepends `AGENTS.md` if present — dedup by
  relative path.
- Everything else (commands/skills/agents/hooks/tool mapping) is byte-for-byte the same code
  path as Claude, via `buildO1CodeExtensionFromPlugin(extensionDir, config as
ClaudePluginConfig)`.
- This is the template a Codex/Grok converter would most plausibly follow, since both target
  formats are described as "Claude-plugin-compatible" by their own docs (see Part 2).

### Marketplaces

- `packages/core/src/extension/marketplace.ts` — `parseSourceAndPluginName()` splits
  `<repo>:<pluginName>` (careful about `http://`, `git@`, `sso://`, and Windows drive letters
  like `C:\`), `isOwnerRepoFormat()`/`convertOwnerRepoToGitHubUrl()` handle `owner/repo`
  shorthand, `loadMarketplaceConfigFromSource()` (line 320) and `parseInstallSource()` (line 410) are the two exported entry points used by `extensionManager.ts`.
- `ClaudeMarketplaceConfig` (declared in `claude-converter.ts`, re-exported/typed in
  `marketplace.ts` and `config.ts`): `{ name, owner: { name, email }, plugins:
ClaudeMarketplacePluginConfig[], metadata? }`. `ClaudeMarketplacePluginConfig` extends
  `ClaudePluginConfig` with `source`, `category?`, `strict?`, `tags?`.
- `ExtensionInstallMetadata.marketplaceConfig?: ClaudeMarketplaceConfig` — a live install
  records the whole marketplace config it was resolved from.
- CLI: `o1-code extensions sources add|list|update|remove` (`packages/cli/src/commands/
extensions/sources.ts`), backed by `SourceRegistryStore` and `ExtensionSourceType = 'github' |
'git' | 'http' | 'local'` (`packages/core/src/extension/sourceRegistry.ts`). These feed the
  Discover tab of `/extensions manage` (`ExtensionsManagerDialog.tsx` → `DiscoverTab.tsx` /
  `SourcesTab.tsx`).
- `/extensions explore [source]` slash command (`packages/cli/src/ui/commands/
extensionsCommand.ts`): a hardcoded map of two named marketplaces —
  `Gemini: 'https://geminicli.com/extensions/'`, `ClaudeCode:
'https://claudemarketplaces.com/'` — opened in the browser. A Codex/Grok converter would
  plausibly add `Codex`/`Grok` entries here pointing at their marketplace UIs, though this is
  cosmetic/discovery-only, not required for installs to work.
- Tests: `extensionManager.test.ts`, `marketplace.test.ts`, `sourceRegistry.test.ts`,
  `extension-converter.test.ts`.

### Tests — file names and patterns

- One test file per converter, colocated: `claude-converter.test.ts`,
  `gemini-converter.test.ts`, `qoder-converter.test.ts`, plus `extension-converter.test.ts` for
  the dispatcher itself, `extensionManager.test.ts` for the end-to-end install flow.
- Vitest (`describe`/`it`/`expect`/`vi`), imports the converter's exported functions directly
  (e.g. `convertClaudeToO1CodeConfig`, `convertClaudeAgentConfig`, `mergeClaudeConfigs`,
  `isClaudePluginConfig`, `convertClaudePluginPackage`, `convertClaudePluginStandalone`,
  `normalizeClaudeMcpServer`).
- `github.js`'s `cloneFromGit`/`downloadFromGitHubRelease` are mocked with `vi.mock` (via
  `importOriginal` + override) so tests exercising the `git-subdir`/`github`/`url` source paths
  never touch the network; they still exercise real filesystem operations against a real temp
  dir.
- **No dedicated fixture directories** (`__fixtures__/`, `fixtures/`) exist anywhere under
  `packages/core/src/extension`. Every test builds its own manifest/plugin tree inline with
  `fs.mkdirSync`/`fs.writeFileSync` inside `beforeEach`/the test body, then cleans up in
  `afterEach`. A new Codex/Grok converter's tests should follow the same self-contained,
  in-test-body fixture pattern rather than introducing a fixtures folder.

### Docs

- `docs/users/extension/introduction.md` is the single user-facing doc describing every
  converter, each under its own `#### From <Format>` heading ("From Claude Code Marketplace",
  "From `gemini-extension.json` extensions", "From Qoder Plugins", "From Agent Plugins v1",
  plus npm/git/local/archive-URL install sources). A Codex/Grok converter needs its own
  `#### From <Format>` section here, following the existing pattern (bullet list of what gets
  converted/preserved, one or two `o1-code extensions install ...` examples).
- `docs/users/extension/agent-plugins.md` documents the portable Agent Plugins v1 format (no
  conversion, native support) — relevant because, per Part 2, both Codex's and Grok's plugin
  formats are converging toward Claude-plugin-shaped or portable-schema-shaped manifests, so a
  chunk of "Codex/Grok plugins" may already install via this path with zero new code, and only
  the non-portable / legacy-manifest-only plugins need the new converter.
- `docs/users/extension/extension-releasing.md`, `docs/users/extension/getting-started-extensions.md` exist but don't enumerate source formats.
- **i18n**: there is no per-format i18n key. The only user-facing string that varies by
  `originSource` is generic and interpolates the value directly:
  - `packages/cli/src/commands/extensions/consent.ts:161` — `t('You are installing an
extension from {{originSource}}. Some features may not work perfectly with O1-Code.',
{ originSource })`, guarded by `originSource !== 'O1Code' && originSource !== 'AgentPlugins'`
    (consent.ts:158) — so adding `'Codex'`/`'Grok'` to the union automatically triggers this
    notice with no new key needed.
  - `packages/cli/src/commands/extensions/utils.ts:99-100` — `` `\n ${t('Origin:')}
${extension.installMetadata.originSource}` `` — same, generic.
  - `packages/cli/src/ui/components/extensions/views/PluginDetailView.tsx:158-160` — renders
    `ext.installMetadata.originSource` directly, generic.
  - The one _non_-generic spot is `ExtensionActionsView.tsx:219-225`, which special-cases
    `originSource === 'Claude'` specifically to explain that Claude marketplace plugins
    "cannot be update-checked ... (update by reinstalling)" — worth checking whether Codex/Grok
    marketplace installs have the same update-by-reinstall limitation, since that's the one
    place a new origin would need a deliberate (not automatic) decision.
- `packages/core/src/skills/bundled/extension-creator/SKILL.md` (the bundled skill for
  _authoring_ new native o1-code extensions) does **not** mention Claude/Gemini/Qoder/format
  conversion at all — it only covers the native o1-code extension shape, linking approval, and
  test/handoff flow. No changes needed there for a new converter.

### File checklist for a new converter (Codex, and separately Grok)

Based on the Qoder-as-thin-Claude-wrapper precedent, the minimal touch set per new format is:

1. `packages/core/src/extension/<format>-converter.ts` — manifest loader + detector
   (`is<Format>PluginConfig`/`get<Format>ManifestPath` style) + `convert<Format>Plugin()`,
   most likely delegating to `buildO1CodeExtensionFromPlugin` from `claude-converter.ts` if the
   manifest is Claude-plugin-shaped (very likely per Part 2), or a bespoke builder if not.
2. `packages/core/src/extension/<format>-converter.test.ts` — colocated, inline fixtures, no
   new fixtures directory.
3. `packages/core/src/extension/extension-converter.ts` — add the manifest constant to
   `SUPPORTED_EXTENSION_MANIFESTS`, add a detection branch to `convertCompatibleExtension()`
   (mind the ordering rules already encoded there — see Detection order above), import the new
   converter.
4. `packages/core/src/config/config.ts` — extend `ExtensionOriginSource` with the new value(s).
5. `packages/core/src/extension/extension-converter.test.ts` and/or `extensionManager.test.ts`
   — dispatcher-level coverage for the new detection branch and its precedence relative to the
   others.
6. `docs/users/extension/introduction.md` — new `#### From <Format>` section.
7. Possibly `packages/cli/src/ui/commands/extensionsCommand.ts` — add a named marketplace entry
   to the `/extensions explore` map if the format has a well-known public marketplace URL
   (`Gemini`/`ClaudeCode` precedent).
8. Possibly `packages/cli/src/ui/components/extensions/views/ExtensionActionsView.tsx:219-225`
   — decide whether the new origin(s) also can't be update-checked (reinstall-only), same as
   Claude marketplace plugins.
9. No i18n key additions required for the install notice (generic, see above); no changes to
   `extension-creator` SKILL.md (out of scope — that skill is about authoring native
   extensions, not converting foreign ones).

---

## Part 2 — the target formats (from public documentation, 2026)

**Caveat**: both ecosystems are described in blog posts, community threads, and (for Codex) an
in-repo skill reference file rather than one single stable spec page, and some details conflict
between sources or come from a fetch tool that summarizes rather than quotes verbatim. Anything
not independently corroborated across at least two sources is marked **unconfirmed**.

### Codex plugins (OpenAI Codex CLI/App)

**Two coexisting manifest shapes**, per `developers.openai.com/codex/plugins/build`
([source](https://developers.openai.com/codex/plugins/build)):

1. **Portable root manifest** (preferred going forward) — `plugin.json` at the plugin root,
   `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"` — **this is
   exactly the schema o1-code already loads natively as "Agent Plugins v1"**
   (`packages/core/src/extension/agent-plugins-v1/manifest.ts`,
   `AGENT_PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'`).
   Fields: `name` (kebab-case), `version` (semver), `description`, and optionally `author`
   (`name`/`email`/`url`), `homepage`, `repository`, `license`, `keywords`, and an
   `extensions` object holding a `"com.openai"` overlay with `apps` (path to `.app.json`),
   `hooks` (path or inline), and `interface` (presentation metadata: `displayName`,
   `shortDescription`, `longDescription`, `category`, `brandColor`, `composerIcon`, `logo`,
   `screenshots`, `defaultPrompt[]`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`).
   **Consequence for o1-code**: a Codex plugin shipped in this portable shape needs _no new
   converter at all_ — it already installs through the existing Agent Plugins v1 path.
2. **Legacy/standalone manifest** — `.codex-plugin/plugin.json` (this is the format actually
   requested by the task, and the one that needs a new converter, since it is _not_ the
   portable schema and has no `$schema` field). Per the in-repo skill spec file
   ([openai/codex `plugin-json-spec.md`](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/references/plugin-json-spec.md),
   fetched raw), required fields are `name` (kebab-case), `version` (strict semver),
   `description`, `author.name`, and `interface` (yes, required in this legacy shape, unlike
   the portable one). Optional: `author.email`, `author.url`, `homepage`, `repository`,
   `license`, `keywords`, `skills` (relative path to skills dir/files), `hooks` (path to hook
   config), `mcpServers` (string path to `.mcp.json`, or inline object), `apps` (path to
   `.app.json`, describing ChatGPT "app" connector integrations — out of scope, to be skipped
   with a notice per the task). The `interface` object mirrors the portable overlay's fields
   verbatim (`displayName`, `shortDescription`, `longDescription`, `developerName`, `category`,
   `capabilities[]`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`, `defaultPrompt[]`
   max 3 entries × 128 chars, `brandColor`, `composerIcon`, `logo`, `logoDark`,
   `screenshots[]`). All paths in the manifest are relative and must start with `./`; declared
   `skills`/`hooks`/`mcpServers` "supplement" default directory-convention discovery rather
   than replacing it (i.e., like Claude, a plugin can rely purely on `skills/`, `commands/`,
   `agents/` at the plugin root without declaring them in the manifest — **unconfirmed** for
   `commands/`/`agents/` specifically, since the in-repo spec file and the community forum
   thread each showed some plugins with `agents/openai.yaml` and a "plugin-level agents/,
   commands/" mention in one search-engine synthesis, but no source enumerated a `commands/`
   or `agents/` convention with the same certainty as `skills/`).

- **MCP servers**: `mcpServers` in the legacy manifest is either a string path to `./.mcp.json`
  or inline. One synthesized source (`codex.danielvaughan.com`) shows a `.mcp.json` shaped as
  `{ "servers": { "<name>": { "command", "args", "env": { "X": "${ENV_VAR}" } } } }` — note
  **`servers`, not `mcpServers`**, as the wrapper key in that rendering; this conflicts with
  the in-repo spec's inline example (`"mcpServers": { "server-name": { "type": "http", "url":
"..." } }`) which uses `mcpServers` as the top-level key when _inlined into plugin.json_. It
  is plausible the _file_ `.mcp.json` uses `servers` while the _inline_ manifest field is named
  `mcpServers` and takes the same server-map value — but this is **unconfirmed**; verify
  against a real Codex plugin repo before hard-coding a key name.
- **Hooks**: `hooks/hooks.json` (or a manifest-declared path) with a Claude-Code-shaped
  structure: `{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command":
"python3 ${PLUGIN_ROOT}/hooks/session_start.py", "statusMessage": "..." } ] } ] } }`. Variable
  substitution inside hook commands: `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` (installed plugin dir /
  writable data dir) are the current names, with `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}`
  documented as "legacy compatibility equivalents" that still work — i.e. Codex plugin hooks
  can be written exactly like Claude Code plugin hooks and Just Work. This is a strong signal
  that the Codex converter can reuse `substituteHookVariables` almost unchanged, just adding
  `${PLUGIN_ROOT}`/`${CODEX_PLUGIN_ROOT}` as additional match patterns alongside
  `${CLAUDE_PLUGIN_ROOT}`. **A distinct `${CODEX_PLUGIN_ROOT}` name was not directly confirmed
  in any fetched page** — only `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` and the Claude-legacy pair were
  seen; mark `${CODEX_PLUGIN_ROOT}` as **unconfirmed**.
- **Skills**: `skills/<name>/SKILL.md`, YAML frontmatter with `name`, `description` (minimal
  confirmed fields) — same shape as Claude Code skills; one source additionally described a
  step-numbered instructions convention but that's prose style, not schema.
- **Marketplace file**: confirmed at two locations — personal `~/.agents/plugins/marketplace.json`,
  repo/team `<repo-root>/.agents/plugins/marketplace.json` (consistent across three
  independent sources: `codex-marketplace.com/docs`, `codex.danielvaughan.com`, and the in-repo
  `plugin-json-spec.md`). Schema:
  ```json
  {
    "name": "marketplace-name",
    "interface": { "displayName": "Human-readable name" },
    "plugins": [
      {
        "name": "plugin-id",
        "source": { "source": "local" | "git-subdir" | "github", "path": "...", "url": "..." },
        "policy": {
          "installation": "INSTALLED_BY_DEFAULT" | "AVAILABLE" | "NOT_AVAILABLE",
          "authentication": "ON_FIRST_USE" | "ON_INSTALL"
        },
        "category": "..."
      }
    ]
  }
  ```
  Note the source-type name **`git-subdir`** matches o1-code's own Claude-converter
  `ClaudePluginSource` variant name exactly (`{ source: 'git-subdir', url, path, ref?, sha? }`),
  strongly suggesting the same resolution logic (`resolvePluginSource`) could be shared or
  copy-adapted. A GitHub issue ([openai/codex#27831](https://github.com/openai/codex/issues/27831))
  confirms `local` and `git` sources work today but an `npm` source type
  (`{ "source": "npm", "package": "@scope/name" }`, explicitly modeled after "the Claude Code
  marketplace format") is accepted in the JSON but silently ignored — i.e. `npm` is a
  documented gap in Codex itself, not something to worry about matching.
- **Install commands** — inconsistent across sources, treat as **unconfirmed** which is
  current: `codex plugin marketplace add <owner/repo>` / `--ref <tag>` / `--sparse <path>`,
  `codex plugin marketplace upgrade [name]`, `codex plugin marketplace remove <name>`, `/plugins`
  (TUI browse) per `codex.danielvaughan.com`; versus `npx codex-marketplace add <owner/repo>
--plugins|--plugin --project|--global` per `codex-marketplace.com/docs` (this looks like a
  _third-party_ wrapper tool, not the first-party CLI — treat its command syntax with lower
  confidence than `codex plugin marketplace ...`). Cache path: `~/.codex/plugins/cache/
$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`.
- **Enterprise governance** (out of scope, note only): `requirements.toml` with
  `allowed_marketplaces` and `mcp_servers.allowlist` (name+identity pairs).
- **App integrations** (`.app.json`, `extensions.com.openai.apps`) — ChatGPT "app" connectors;
  confirmed to exist as a concept but no field-level schema was surfaced; per the task, skip
  these with a conversion notice, same treatment as Claude's `outputStyles`.

Sources: [OpenAI Adds Plugin Marketplace to Codex – Unite.AI](https://www.unite.ai/openai-adds-plugin-marketplace-to-codex/) ·
[openai/codex#27831](https://github.com/openai/codex/issues/27831) ·
[OpenAI Community: third-party plugin publishing](https://community.openai.com/t/how-can-third-party-community-plugins-be-published-to-the-codex-marketplace/1377928) ·
[openai/codex plugin-json-spec.md](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/references/plugin-json-spec.md) ·
[Codex Knowledge Base: CLI Plugin Management, v0.137](https://codex.danielvaughan.com/2026/06/04/codex-cli-plugin-management-terminal-commands-marketplace-json-output-v0137/) ·
[Codex Knowledge Base: Plugin Marketplace](https://codex.danielvaughan.com/2026/04/24/codex-cli-plugin-marketplace-building-distributing-extending/) ·
[Codex Plugin Marketplace docs](https://www.codex-marketplace.com/docs) ·
[developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build)

### Grok Build plugins (xAI Grok CLI, "Grok Build")

- **Manifest**: `.grok-plugin/plugin.json`, and per the official marketplace repo README it is
  explicitly **optional** — "provides metadata or overrides component paths" — meaning Grok
  Build, like Claude Code, discovers plugin content by directory convention
  (`skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`) even
  without a manifest declaring those paths. No full field-by-field schema for `plugin.json`
  itself was found in any fetched source (marked **unconfirmed** beyond "optional, overrides
  paths, has _some_ metadata fields" — `name`/`description`/`category`/`version`/`author` are
  plausible by analogy with the marketplace entry fields below, but not directly confirmed on
  the manifest itself).
- **Companion generated file**: `.grok-plugin/plugin-index.json` — auto-generated component
  catalog (skills, commands, agents, MCP servers, hooks, LSP servers a plugin provides);
  explicitly "never hand-edited," regenerated by `scripts/generate-plugin-index.py` and checked
  by `scripts/validate-catalog.py` in CI. This is a build artifact of the marketplace repo, not
  something a converter needs to read or write.
- **Directory layout** (from the `xai-org/plugin-marketplace` README):

  | Component   | Location                                             |
  | ----------- | ---------------------------------------------------- |
  | Skills      | `skills/<name>/SKILL.md`                             |
  | Commands    | `commands/`                                          |
  | Agents      | `agents/`                                            |
  | Hooks       | `hooks/hooks.json`                                   |
  | MCP servers | `.mcp.json`                                          |
  | LSP servers | `.lsp.json` (explicitly to be skipped, per the task) |

- **SKILL.md frontmatter** (from `docs.x.ai/build/features/skills-plugins-marketplaces`,
  confirmed field list): `name` (optional, defaults to directory name), `description`
  (optional, defaults to first paragraph), `when-to-use` / `when_to_use`, `paths` (gitignore
  globs for conditional visibility), `allowed-tools` (YAML list or comma/space-separated
  string), `argument-hint`, `user-invocable` (bool, default true), `disable-model-invocation`
  (bool, default false), `metadata` (string map: author, short-description). Accepted-but-inert
  extra fields: `model`, `effort`, `license`, `compatibility`.
- **Variable substitution**: `${GROK_PLUGIN_ROOT}` and `${GROK_PLUGIN_DATA}` are the confirmed
  names (search results cite both a docs sentence — "Plugin hooks receive GROK_PLUGIN_ROOT and
  GROK_PLUGIN_DATA in their environment" — and a real usage example: `"exec": ["python3",
"${GROK_PLUGIN_ROOT}/plugin.py"]`, and for TypeScript entry points `"exec":
["${GROK_PLUGIN_ROOT}/_sdk/run", "index.ts"]`). Notably, **Grok Build also sets
  `CLAUDE_PLUGIN_ROOT` for backward compatibility** so that Claude-authored skills/hooks that
  hardcode `${CLAUDE_PLUGIN_ROOT}` keep working unmodified inside a Grok plugin — direct
  evidence that Grok Build plugins are deliberately Claude-plugin-compatible at the variable
  level, not just conceptually.
- **MCP servers**: Grok Build reads MCP config from several places at once —
  `~/.grok/config.toml` (`[mcp_servers.<name>]` TOML table: `command`, `args`, `env`,
  `startup_timeout_sec`, `tool_timeout_sec` for stdio; `url`, `headers` for remote), plus (per
  the same docs page) `~/.claude.json`, `.cursor/mcp.json`, and project `.mcp.json` files
  directly — i.e. Grok Build natively understands Claude's `.mcp.json` shape for
  project-scoped servers, so a plugin's bundled `.mcp.json` is almost certainly the same
  `{ "mcpServers": { "<name>": { "command"/"url", ... } } }` shape Claude and o1-code already
  use. The exact top-level key used inside a _plugin's own_ `.mcp.json` (`mcpServers` vs.
  `servers`) was **not independently confirmed** — the TOML section describes the user-config
  format, not necessarily the plugin-bundle file format; the `${VAR}` / `${VAR:-default}`
  substitution syntax it documents for `url`/`command`/`args`/`env`/`headers` is a Grok Build
  system-wide feature, not per-format.
- **Marketplace**: `xai-org/plugin-marketplace` is the confirmed official repository
  ([github.com/xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace)).
  Layout: `.grok-plugin/marketplace.json` (hand-edited catalog index), `.grok-plugin/plugin-index.json`
  (generated), `plugins/` (first-party), `external_plugins/` (third-party vendored locally, vs.
  a remote-source entry pointing at an upstream repo). `marketplace.json` schema:
  ```json
  {
    "name": "my-marketplace",
    "description": "...",
    "owner": { "name": "Organization Name" },
    "plugins": []
  }
  ```
  Plugin entry fields: `name` (required, kebab-case), `source` (required), `description`
  (recommended), `category`, `homepage`, `keywords`, `domains` (URLs that trigger plugin
  suggestions — a Grok-specific concept with no Claude/Codex analogue), `version`, `author`,
  `tags` (optional). Source shapes:
  ```json
  {
    "name": "plugin-name",
    "source": {
      "type": "url",
      "url": "https://github.com/org/repo.git",
      "sha": "<40-char lowercase commit sha>"
    }
  }
  ```
  ```json
  {
    "name": "plugin-name",
    "source": { "type": "local", "path": "./plugins/plugin-name" }
  }
  ```
  Note the discriminator key here is **`type`**, not `source` (unlike Codex's `source.source`
  and Claude's implicit `source: string | {source: 'github'|'url'|'git-subdir', ...}` — three
  different conventions for naming the same discriminator field across the three ecosystems).
  Remote sources _require_ a full 40-hex-char commit `sha` (not a branch/tag/ref) — stricter
  than Claude's `git-subdir` (`ref` or `sha`, either optional) or Codex's marketplace (`--ref
<tag>` for the whole marketplace add, not per-plugin pinning at the JSON level).
- **Security**: "Every remote plugin in the catalog is pinned to a specific commit SHA, and
  Grok Build verifies the pin at install time" — i.e. the marketplace _server_ pins, and the
  _client_ re-verifies, not merely trusts the catalog file.
- **Install commands**: `grok plugin marketplace list`, `grok plugin install <name> --trust`,
  and interactively `/marketplace` then `i` to install inside the Grok Build TUI. A single
  combined extensions modal is reachable via `/plugins`, `/hooks`, `/skills`, or `/mcps`.
  Marketplace _sources_ (as opposed to individual plugins) are configured via
  `[[marketplace.sources]]` in `~/.grok/config.toml` and cached/listed in
  `~/.grok/plugins/known_marketplaces.json`. Plugin _discovery_ paths (for locally-authored,
  non-marketplace plugins) are `./.grok/plugins/`, `~/.grok/plugins/`,
  `~/.grok/plugins/marketplaces/`, a `[plugins] paths` TOML list, or a `--plugin-dir <PATH>`
  CLI flag.
- **Contribution workflow** (marketplace repo maintainers' side, not relevant to o1-code's
  install path but useful context): add/edit an entry in `.grok-plugin/marketplace.json` →
  regenerate `plugin-index.json` (`python3 scripts/generate-plugin-index.py`) → validate
  (`python3 scripts/validate-catalog.py`) → PR with required CI + code-owner review.

Sources: [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) ·
[xAI Ships Grok Build Plugin Marketplace — MarkTechPost](https://www.marktechpost.com/2026/06/11/xai-ships-grok-build-plugin-marketplace-with-mongodb-vercel-sentry-chrome-devtools-cloudflare-and-superpowers-plugins-at-launch/) ·
[Grok Build Plugin Marketplace announcement — x.ai](https://x.ai/news/grok-plugin-marketplace) ·
[Skills, Plugins & Marketplaces — docs.x.ai](https://docs.x.ai/build/features/skills-plugins-marketplaces) ·
[MCP Servers — docs.x.ai](https://docs.x.ai/build/features/mcp-servers) ·
[Grok Build overview — docs.x.ai](https://docs.x.ai/build/overview) ·
[Introducing Grok Build — x.ai](https://x.ai/news/grok-build-cli) ·
[ScriptedAlchemy/agent-bundle#700 — host support notes for Grok Build](https://github.com/ScriptedAlchemy/agent-bundle/issues/700)

### What maps 1:1 onto Claude Code plugin concepts, and what doesn't

**Codex (legacy `.codex-plugin/plugin.json` shape)**:

- 1:1: skills (`skills/<name>/SKILL.md`), hooks (`hooks/hooks.json`, Claude-shaped hook event
  structure, `${CLAUDE_PLUGIN_ROOT}` accepted as a legacy alias alongside `${PLUGIN_ROOT}`),
  MCP servers (inline object keyed by server name, `type`-discriminated transport akin to
  Claude's `.mcp.json`), marketplace `source.source: 'local' | 'git-subdir' | 'github'` (the
  `git-subdir` name is identical to o1-code's own `ClaudePluginSource` variant).
- No equivalent in Claude: the `interface` block (rich marketplace-presentation metadata:
  `brandColor`, `composerIcon`, `logo`/`logoDark`, `screenshots`, `defaultPrompt[]`,
  `capabilities[]`) and `apps`/`.app.json` (ChatGPT app connectors) — both should be dropped
  with a conversion notice (`interface` is presentational, safe to ignore beyond maybe
  `displayName`→o1-code's own `displayName`; `apps` has no o1-code concept at all, same
  treatment as Claude's `outputStyles`).
- Ambiguous / needs confirmation before coding: the `.mcp.json` top-level wrapper key
  (`mcpServers` vs `servers` — sources conflict); whether `commands/`/`agents/` are real
  directory conventions for the legacy manifest shape with the same certainty as `skills/`.

**Grok Build**:

- 1:1, and unusually strong: hooks/skills/MCP are described as directly Claude-compatible
  (Grok Build sets `CLAUDE_PLUGIN_ROOT` itself for compat), `.mcp.json` likely shares Claude's
  `mcpServers` wrapper (Grok Build natively reads `.claude.json` and Claude-shaped
  `.mcp.json`), directory layout (`skills/`, `commands/`, `agents/`, `hooks/hooks.json`,
  `.mcp.json`) matches Claude's plugin layout field-for-field.
- No equivalent in Claude: `.lsp.json` (LSP servers — skip per the task, same as Agent Plugins
  v1's own skip list for lsp/legacy-SSE-MCP), the marketplace's `domains` field (URLs that
  trigger contextual plugin suggestions — a Grok-specific UX feature, has no install-time
  meaning), and the marketplace's mandatory 40-char commit-`sha` pinning (stricter than
  Claude's optional `ref`/`sha`).
- Ambiguous / needs confirmation: the `.grok-plugin/plugin.json` manifest's own field list
  (only "optional, overrides paths" was confirmed, not a field enumeration); whether
  `${GROK_PLUGIN_ROOT}` substitution is applied only inside `hooks.json`/`plugin.json` `exec`
  entries (confirmed) or more broadly (e.g. inside `.mcp.json` `command`/`args`, by analogy
  with Claude's hook-only substitution — unconfirmed for Grok specifically).

### Practical implication for the converter design

Given the strong Claude-plugin compatibility signal for both formats, the natural implementation
mirrors Qoder: a `codex-converter.ts` and `grok-converter.ts`, each detecting its own manifest
(`.codex-plugin/plugin.json`, `.grok-plugin/plugin.json`) and — where the manifest is close
enough to `ClaudePluginConfig` — delegating to `buildO1CodeExtensionFromPlugin()` after mapping
format-specific fields (Codex's `interface`/`apps`; none-yet-confirmed Grok manifest fields)
onto Claude's shape or into `ExtensionConfig` directly, plus extending
`substituteHookVariables`-equivalent logic to also match `${PLUGIN_ROOT}`/`${CODEX_PLUGIN_ROOT}`
and `${GROK_PLUGIN_ROOT}`/`${GROK_PLUGIN_DATA}` alongside the existing
`${CLAUDE_PLUGIN_ROOT}` pattern. Before committing to that design, the ambiguous points flagged
above (Codex's `.mcp.json` key name, Grok's own `plugin.json` field list, and whether
Grok's variable substitution extends beyond hooks) are worth a direct look at a real published
plugin repository (e.g. one of the `xai-org/plugin-marketplace` first-party `plugins/*` entries,
or a Codex marketplace plugin repo) rather than trusting the synthesized doc summaries further.
