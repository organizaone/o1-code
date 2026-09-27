/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converter for Codex plugins (`.codex-plugin/plugin.json`). The manifest is
 * Claude Code's shape plus the presentation-only `interface` block and `apps`.
 */
import type { ExtensionConfig } from './extensionManager.js';
import { convertClaudeShapedPlugin } from './claude-shaped-plugin.js';

export const CODEX_PLUGIN_MANIFEST = '.codex-plugin/plugin.json';

export async function convertCodexPlugin(
  extensionDir: string,
): Promise<{ config: ExtensionConfig; convertedDir: string }> {
  return convertClaudeShapedPlugin(
    extensionDir,
    CODEX_PLUGIN_MANIFEST,
    'Codex',
  );
}
