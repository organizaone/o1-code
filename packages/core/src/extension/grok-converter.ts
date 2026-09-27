/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converter for Grok Build plugins (`.grok-plugin/plugin.json`). The manifest
 * and directory layout are Claude Code's; language servers are skipped.
 */
import type { ExtensionConfig } from './extensionManager.js';
import { convertClaudeShapedPlugin } from './claude-shaped-plugin.js';

export const GROK_PLUGIN_MANIFEST = '.grok-plugin/plugin.json';

export async function convertGrokPlugin(
  extensionDir: string,
): Promise<{ config: ExtensionConfig; convertedDir: string }> {
  return convertClaudeShapedPlugin(extensionDir, GROK_PLUGIN_MANIFEST, 'Grok');
}
