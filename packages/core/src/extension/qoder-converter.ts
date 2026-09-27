/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExtensionConfig } from './extensionManager.js';
import {
  buildO1CodeExtensionFromPlugin,
  resolvePluginMcpServers,
  resolvePluginRelativeFile,
  type ClaudePluginConfig,
} from './claude-converter.js';
import { realPathWithin } from './gemini-converter.js';
import { EXTENSIONS_CONFIG_FILENAME } from './variables.js';
import { stripAnsiAndControl } from '../utils/textUtils.js';

export const QODER_PLUGIN_MANIFEST = '.qoder-plugin/plugin.json';

type QoderPluginConfig = Omit<ClaudePluginConfig, 'version'> & {
  version?: string;
  displayName?: string;
  contextFileName?: string | string[];
};

function loadQoderConfig(extensionDir: string): QoderPluginConfig {
  const configPath = path.join(extensionDir, QODER_PLUGIN_MANIFEST);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Qoder plugin configuration not found at ${configPath}`);
  }
  if (!realPathWithin(configPath, extensionDir)) {
    throw new Error(
      `Qoder plugin configuration at ${configPath} resolves through a symlink outside the plugin`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    throw new Error(
      stripAnsiAndControl(
        `Invalid Qoder plugin configuration at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Invalid Qoder plugin configuration at ${configPath}: expected a JSON object`,
    );
  }

  const config = parsed as QoderPluginConfig;
  if (typeof config.name !== 'string' || config.name.length === 0) {
    throw new Error('Qoder plugin config must have name field');
  }
  return {
    ...config,
    version:
      typeof config.version === 'string' && config.version.length > 0
        ? config.version
        : '1.0.0',
    displayName:
      typeof config.displayName === 'string' ? config.displayName : undefined,
    description:
      typeof config.description === 'string' ? config.description : undefined,
  };
}

function resolveContextFiles(
  extensionDir: string,
  configured: string | string[] | undefined,
): string[] | undefined {
  const configuredFiles = configured
    ? Array.isArray(configured)
      ? configured
      : [configured]
    : [];
  const contextFiles: string[] = [];
  const seen = new Set<string>();
  const addContextFile = (relativePath: string, prepend = false): void => {
    const resolved = resolvePluginRelativeFile(extensionDir, relativePath);
    if (!resolved) return;
    try {
      if (!fs.statSync(resolved).isFile()) return;
    } catch {
      return;
    }
    const normalized = path.relative(path.resolve(extensionDir), resolved);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      if (prepend) contextFiles.unshift(normalized);
      else contextFiles.push(normalized);
    }
  };

  for (const file of configuredFiles) {
    if (typeof file === 'string') addContextFile(file);
  }
  addContextFile('system-prompt.md');
  if (contextFiles.length > 0) {
    addContextFile('AGENTS.md', true);
  }
  return contextFiles.length > 0 ? contextFiles : undefined;
}

export async function convertQoderPlugin(
  extensionDir: string,
): Promise<{ config: ExtensionConfig; convertedDir: string }> {
  const config = loadQoderConfig(extensionDir);
  config.mcpServers = resolvePluginMcpServers(
    extensionDir,
    config.mcpServers,
    'Qoder',
    QODER_PLUGIN_MANIFEST,
  );
  const converted = await buildO1CodeExtensionFromPlugin(
    extensionDir,
    config as ClaudePluginConfig,
  );
  const contextFileName = resolveContextFiles(
    converted.convertedDir,
    config.contextFileName,
  );
  const o1codeConfig: ExtensionConfig = {
    ...converted.config,
    displayName: config.displayName,
    contextFileName,
  };
  try {
    fs.writeFileSync(
      path.join(converted.convertedDir, EXTENSIONS_CONFIG_FILENAME),
      JSON.stringify(o1codeConfig, null, 2),
      'utf-8',
    );
  } catch (error) {
    fs.rmSync(converted.convertedDir, { recursive: true, force: true });
    throw error;
  }
  return { ...converted, config: o1codeConfig };
}
