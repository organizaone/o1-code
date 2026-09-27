/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Standalone conversion for plugin formats whose manifest follows Claude
 * Code's `plugin.json` shape under their own directory (Grok Build, Codex).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExtensionConfig } from './extensionManager.js';
import {
  buildO1CodeExtensionFromPlugin,
  resolvePluginMcpServers,
  rewritePluginRootInMcpServers,
  writeDisplayName,
} from './claude-converter.js';
import {
  loadClaudeShapedManifest,
  mapPluginManifestFields,
  type PluginManifestFormat,
} from './plugin-manifest.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('PLUGIN_CONVERTER');

export async function convertClaudeShapedPlugin(
  extensionDir: string,
  manifestRelativePath: string,
  format: Exclude<PluginManifestFormat, 'Claude'>,
): Promise<{ config: ExtensionConfig; convertedDir: string }> {
  const manifest = loadClaudeShapedManifest(
    path.join(extensionDir, ...manifestRelativePath.split('/')),
    format,
    extensionDir,
  );
  const { config, displayName } = mapPluginManifestFields(manifest, format);

  if (
    format === 'Grok' &&
    fs.existsSync(path.join(extensionDir, '.lsp.json'))
  ) {
    debugLogger.warn(
      `Ignoring .lsp.json in ${config.name}: language servers from Grok Build plugins are not supported.`,
    );
  }

  config.mcpServers = rewritePluginRootInMcpServers(
    resolvePluginMcpServers(
      extensionDir,
      config.mcpServers,
      format,
      manifestRelativePath,
    ),
  );

  const converted = await buildO1CodeExtensionFromPlugin(extensionDir, config);
  return { ...converted, config: writeDisplayName(converted, displayName) };
}
