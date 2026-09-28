# Report: Codex and Grok Build plugin converters

Branch `limpeza`, working tree only (nothing committed, staged or stashed).

## Files

Added (all with the `Copyright 2026 o1-code contributors` header):

- `packages/core/src/extension/plugin-manifest.ts`: `PLUGIN_MANIFEST_PATHS`,
  `MARKETPLACE_MANIFEST_PATHS`, `findPluginManifest`, `findMarketplaceManifest` (symlink-safe via
  `realPathWithin`; they skip an unsafe candidate and go on to the next one), `loadClaudeShapedManifest`,
  `mapPluginManifestFields` (the Codex `interface`/`apps` mapping and dropping Grok `lspServers`),
  `marketplaceManifestFormat`, `isMarketplaceOriginSource`, and the `PluginManifestFormat` type.
- `packages/core/src/extension/claude-shaped-plugin.ts`: `convertClaudeShapedPlugin`, the shared
  standalone flow that Codex and Grok both use.
- `packages/core/src/extension/codex-converter.ts`: `CODEX_PLUGIN_MANIFEST` and `convertCodexPlugin`.
- `packages/core/src/extension/grok-converter.ts`: `GROK_PLUGIN_MANIFEST` and `convertGrokPlugin`.
- Tests: `plugin-manifest.test.ts`, `codex-converter.test.ts`, `grok-converter.test.ts`.

Changed:

- core: `variables.ts`, `claude-converter.ts`, `qoder-converter.ts`, `extension-converter.ts`,
  `marketplace.ts`, `extensionManager.ts`, `github.ts`, `extension/index.ts`, `config/config.ts`.
- `acp-bridge/src/status.ts` (`ServeExtensionOriginSource`) and `sdk-typescript/src/daemon/types.ts`
  (`DaemonExtensionOriginSource`): added `'Codex' | 'Grok'`.
- cli: `ExtensionActionsView.tsx`, the 9 locale files, `extensionsCommand.ts`, and
  `serve/routes/workspace-extensions.ts` (display of the new `local` source).
- Tests: `variables.test.ts`, `claude-converter.test.ts`, `extension-converter.test.ts`,
  `marketplace.test.ts`, `github.test.ts`, `ExtensionActionsView.test.tsx`, `extensionsCommand.test.ts`.
- Docs: `docs/users/extension/introduction.md` (two new sections, explore list and table) and
  `docs/users/features/commands.md` (explore usage). `CHANGELOG.md` `[0.1.0]` → `### Agent`.

## Decisions where the brief was silent

- **MCP helpers location.** Qoder's `loadMcpServersFile` and `resolveMcpServers` moved into
  `claude-converter.ts` as the exported `loadPluginMcpServersFile` and `resolvePluginMcpServers`,
  with a format-label parameter. The marketplace path needs them too, so putting them there avoids an
  import cycle. Qoder's error messages are unchanged.
- **Plugin-root variables in MCP configs.** For Grok and Codex, `${CLAUDE_|GROK_|CODEX_}PLUGIN_ROOT`
  and `${PLUGIN_ROOT}` inside MCP server strings are rewritten to `${extensionPath}`, which the
  loader already resolves (`rewritePluginRootInMcpServers`). I left `VARIABLE_SCHEMA` and the
  loader's hydration context unchanged.
- **Variables regex.** One exported `PLUGIN_ROOT_VARIABLE_PATTERN`. The hook substitution now uses a
  replacer function, so `$&` in a path stays literal (before, only the markdown path did this).
- **Marketplace path, non-Claude plugin manifest.** When the manifest found inside the resolved
  source is Grok or Codex, the converter applies the field mapping, defaults `version` to `1.0.0`
  and resolves `mcpServers`, including the root `.mcp.json` fallback. A `.claude-plugin/plugin.json`
  found through any marketplace keeps the existing Claude behaviour exactly.
- **`convertClaudePluginPackage`** now also returns `format` (the marketplace format). The dispatcher
  uses it for `originSource`. The existing fields are unchanged.
- **`url` source pinned** (`sha || ref`): clones with `ref` and skips the release download. `local`
  source: `path` must be a non-absolute string. It goes through the same confinement as the
  relative-string form, which I extracted into `resolveMarketplaceLocalSource`.
- **Marketplace validation.** `fetchGitHubMarketplaceConfig` and `readLocalMarketplaceConfig` now
  require a string `name` and a `plugins` array, and move on to the next path otherwise. Previously
  any parseable JSON was accepted. The direct-file and direct-URL branches of
  `loadMarketplaceConfigFromSource` are unchanged. The GitHub lookup tries API then raw for each path
  in turn, so a repo without a marketplace now costs up to 6 requests instead of 2.
- **`SUPPORTED_EXTENSION_MANIFESTS`** also gained `.grok-plugin/marketplace.json` and
  `.agents/plugins/marketplace.json`, so `github.ts` archive detection accepts marketplace-only
  repos. They are appended at the end, so the indexes `[0]` and `[3]` still point to the same entries.
- **Claude-only checks extended** to the new origins:
  - `extensionManager.ts`: the plugin choice prompt when there is no `pluginName`, and
    `performVariableReplacement` at install.
  - `github.ts`: a legacy git install without a recorded commit is not updatable. A local standalone
    Grok or Codex plugin is converted before its update check (not when it came from a marketplace
    with a `pluginName`, the same rule as the Claude local-marketplace test).
  - I left the legacy "Claude marketplace release without `externalContent`" check Claude-only,
    because new Grok and Codex installs always record `externalContent`.
- **`plugin-manifest.js` is re-exported** from `extension/index.ts`, so the CLI can import
  `isMarketplaceOriginSource` from the package root, the way that view already imports from core.

## Deviations from the brief

- **CHANGELOG sentence.** The brief's verbatim "Gemini CLI" is a forbidden name in `brand.json`
  (`brand-lint` failed on it), so the line reads "Claude Code, Gemini, Qoder, Codex and Grok Build
  plugins and their marketplaces."
- **Missing-marketplace error.** The message keeps the `.claude-plugin` path and adds "(also looked
  for …)".
- **TDD slip.** The `ExtensionActionsView` test was written after the view edit, so I did not watch it
  fail. The i18n key change guarantees the assertion would have failed before the change.

## Tests (files run, results)

core (`npx vitest run --coverage.enabled=false`):

| File                                                                              | Result                               |
| --------------------------------------------------------------------------------- | ------------------------------------ |
| `plugin-manifest.test.ts` (new)                                                   | 13 passed                            |
| `codex-converter.test.ts` (new)                                                   | 9 passed                             |
| `grok-converter.test.ts` (new)                                                    | 8 passed                             |
| `extension-converter.test.ts`                                                     | 12 passed (+8 new)                   |
| `claude-converter.test.ts`                                                        | 84 passed, 2 skipped (+14 new)       |
| `marketplace.test.ts`                                                             | 38 passed (+5 new)                   |
| `variables.test.ts`                                                               | 31 passed (+9 new)                   |
| `github.test.ts`                                                                  | 152 passed, 9 skipped (+4 new cases) |
| `qoder-converter.test.ts`                                                         | 22 passed, 3 skipped                 |
| `extensionManager.test.ts` + `sourceRegistry.test.ts` + `qoder-converter.test.ts` | 218 passed, 6 skipped                |

The skips were already there before this change.

cli:

| File                                                                                                     | Result                                      |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `ExtensionActionsView.test.tsx`, `ExtensionActionsView.updateFlow.test.tsx`, `extensionsCommand.test.ts` | 31 passed (+3 view cases, +3 explore cases) |

## Gates (repo root, one at a time)

- `npm run build -- --cli-only`: pass. The first run failed on `workspace-extensions.ts`, which I
  fixed.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npx tsx scripts/check-i18n.ts`: pass ("All checks passed").
- `npx prettier --check`: pass on every touched file, including the docs and `CHANGELOG.md`. Several
  new or edited TS files needed `prettier --write`.
- `node scripts/o1/brand-lint.mjs`: **exits 1, on 3 lines that were already at `HEAD` and that I did
  not touch**:
  - `packages/cli/src/ui/voice/dashscope-asr-realtime-session.test.ts:53`
  - `packages/vscode-ide-companion/NOTICE:21`
  - `packages/zed-extension/NOTICE:21`

  This change adds no violations.

## Open points

- `brand-lint` fails on `HEAD` because of the 3 lines above. That needs a maintainer decision (an
  allow entry or a fix there).
- A hooks file declared through a string path is substituted at conversion time with the plugin's
  **source** directory, not the installed path. That is the existing behaviour of
  `buildO1CodeExtensionFromPlugin`, shared with Claude and Qoder. Undeclared `hooks/hooks.json` is
  substituted at load time with the installed path, which is correct. Worth a separate fix.
- The `local` source branch in `serve/routes/workspace-extensions.ts` compiles but has no test.
- `${GROK_PLUGIN_DATA}` and `${PLUGIN_DATA}` are left alone; nothing maps them.
- Not verified against a live network or real published repos; all tests use inline fixtures and
  mocks.
