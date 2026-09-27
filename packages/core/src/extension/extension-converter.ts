/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXTENSIONS_CONFIG_FILENAME } from './variables.js';
import {
  convertGeminiExtensionPackage,
  isGeminiExtensionConfig,
} from './gemini-converter.js';
import {
  convertClaudePluginPackage,
  convertClaudePluginStandalone,
} from './claude-converter.js';
import {
  convertQoderPlugin,
  QODER_PLUGIN_MANIFEST,
} from './qoder-converter.js';
import { convertGrokPlugin, GROK_PLUGIN_MANIFEST } from './grok-converter.js';
import {
  CODEX_PLUGIN_MANIFEST,
  convertCodexPlugin,
} from './codex-converter.js';
import type {
  ExtensionNetworkPolicy,
  ExtensionOriginSource,
} from '../config/config.js';
import {
  AGENT_PLUGIN_MANIFEST,
  AGENT_PLUGIN_SCHEMA,
  getAgentPluginSchemaStatus,
} from './agent-plugins-v1/manifest.js';

export const SUPPORTED_EXTENSION_MANIFESTS = [
  EXTENSIONS_CONFIG_FILENAME,
  'gemini-extension.json',
  '.claude-plugin/marketplace.json',
  '.claude-plugin/plugin.json',
  QODER_PLUGIN_MANIFEST,
  GROK_PLUGIN_MANIFEST,
  CODEX_PLUGIN_MANIFEST,
  '.grok-plugin/marketplace.json',
  '.agents/plugins/marketplace.json',
] as const;

export async function convertCompatibleExtension(
  extensionDir: string,
  pluginName?: string,
  networkPolicy?: ExtensionNetworkPolicy,
  signal?: AbortSignal,
): Promise<{
  extensionDir: string;
  originSource: ExtensionOriginSource;
  externalContent: boolean;
}> {
  signal?.throwIfAborted();
  let newExtensionDir = extensionDir;
  let originSource: ExtensionOriginSource = 'O1Code';
  let externalContent = false;
  const agentPluginStatus = pluginName
    ? 'unrelated'
    : getAgentPluginSchemaStatus(extensionDir);
  const configFilePath = path.join(
    extensionDir,
    SUPPORTED_EXTENSION_MANIFESTS[0],
  );
  if (agentPluginStatus === 'unsupported') {
    throw new Error(
      `Unsupported Agent Plugins schema. Supported schema: "${AGENT_PLUGIN_SCHEMA}".`,
    );
  } else if (agentPluginStatus === 'supported') {
    originSource = 'AgentPlugins';
  } else if (fs.existsSync(configFilePath)) {
    newExtensionDir = extensionDir;
  } else if (isGeminiExtensionConfig(extensionDir)) {
    newExtensionDir = (await convertGeminiExtensionPackage(extensionDir))
      .convertedDir;
    originSource = 'Gemini';
  } else if (pluginName) {
    // An explicit marketplace selection must win over root-manifest
    // detection: a repo can carry both a marketplace and a root plugin
    // manifest, and silently substituting the latter installs different
    // content than the one selected.
    const converted = await convertClaudePluginPackage(
      extensionDir,
      pluginName,
      networkPolicy,
      signal,
    );
    newExtensionDir = converted.convertedDir;
    if (getAgentPluginSchemaStatus(newExtensionDir) !== 'unrelated') {
      fs.rmSync(path.join(newExtensionDir, AGENT_PLUGIN_MANIFEST), {
        force: true,
      });
    }
    // The marketplace the user chose names the origin, whichever plugin
    // manifest the selected plugin carries.
    originSource = converted.format;
    externalContent = converted.externalContent;
  } else if (fs.existsSync(path.join(extensionDir, QODER_PLUGIN_MANIFEST))) {
    newExtensionDir = (await convertQoderPlugin(extensionDir)).convertedDir;
    originSource = 'Qoder';
  } else if (
    fs.existsSync(path.join(extensionDir, SUPPORTED_EXTENSION_MANIFESTS[3]))
  ) {
    newExtensionDir = (await convertClaudePluginStandalone(extensionDir))
      .convertedDir;
    originSource = 'Claude';
  } else if (fs.existsSync(path.join(extensionDir, GROK_PLUGIN_MANIFEST))) {
    newExtensionDir = (await convertGrokPlugin(extensionDir)).convertedDir;
    originSource = 'Grok';
  } else if (fs.existsSync(path.join(extensionDir, CODEX_PLUGIN_MANIFEST))) {
    newExtensionDir = (await convertCodexPlugin(extensionDir)).convertedDir;
    originSource = 'Codex';
  }
  signal?.throwIfAborted();
  return { extensionDir: newExtensionDir, originSource, externalContent };
}
