/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Locates and loads the Claude-shaped plugin and marketplace manifests that
 * Claude Code, Grok Build and Codex plugins carry under their own directories.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ClaudePluginConfig } from './claude-converter.js';
import { realPathWithin } from './gemini-converter.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { stripAnsiAndControl } from '../utils/textUtils.js';

const debugLogger = createDebugLogger('PLUGIN_MANIFEST');

export type PluginManifestFormat = 'Claude' | 'Grok' | 'Codex';

export const PLUGIN_MANIFEST_PATHS = [
  '.claude-plugin/plugin.json',
  '.grok-plugin/plugin.json',
  '.codex-plugin/plugin.json',
] as const;

export const MARKETPLACE_MANIFEST_PATHS = [
  '.claude-plugin/marketplace.json',
  '.grok-plugin/marketplace.json',
  '.agents/plugins/marketplace.json',
] as const;

const PLUGIN_MANIFEST_FORMATS: Record<
  (typeof PLUGIN_MANIFEST_PATHS)[number],
  PluginManifestFormat
> = {
  '.claude-plugin/plugin.json': 'Claude',
  '.grok-plugin/plugin.json': 'Grok',
  '.codex-plugin/plugin.json': 'Codex',
};

const MARKETPLACE_MANIFEST_FORMATS: Record<
  (typeof MARKETPLACE_MANIFEST_PATHS)[number],
  PluginManifestFormat
> = {
  '.claude-plugin/marketplace.json': 'Claude',
  '.grok-plugin/marketplace.json': 'Grok',
  '.agents/plugins/marketplace.json': 'Codex',
};

export interface FoundPluginManifest {
  path: string;
  format: PluginManifestFormat;
}

/** A plugin.json in the shape Claude Code defines, plus the fields Codex adds. */
export interface ClaudeShapedPluginManifest extends ClaudePluginConfig {
  displayName?: string;
  interface?: unknown;
  apps?: unknown;
}

export function marketplaceManifestFormat(
  relativePath: (typeof MARKETPLACE_MANIFEST_PATHS)[number],
): PluginManifestFormat {
  return MARKETPLACE_MANIFEST_FORMATS[relativePath];
}

/** True for the origins whose installs come from a plugin marketplace. */
export function isMarketplaceOriginSource(
  originSource: string | undefined,
): originSource is PluginManifestFormat {
  return (
    originSource === 'Claude' ||
    originSource === 'Grok' ||
    originSource === 'Codex'
  );
}

function findFirstManifest<P extends string>(
  dir: string,
  candidates: readonly P[],
  formats: Record<P, PluginManifestFormat>,
): FoundPluginManifest | undefined {
  for (const candidate of candidates) {
    const manifestPath = path.join(dir, ...candidate.split('/'));
    if (!fs.existsSync(manifestPath)) continue;
    // An untrusted clone can make the manifest a symlink to a host file.
    if (!realPathWithin(manifestPath, dir)) {
      debugLogger.warn(
        `Ignoring ${manifestPath}; it resolves through a symlink outside ${dir}.`,
      );
      continue;
    }
    return { path: manifestPath, format: formats[candidate] };
  }
  return undefined;
}

/** First plugin manifest found in `dir`, in `PLUGIN_MANIFEST_PATHS` order. */
export function findPluginManifest(
  dir: string,
): FoundPluginManifest | undefined {
  return findFirstManifest(dir, PLUGIN_MANIFEST_PATHS, PLUGIN_MANIFEST_FORMATS);
}

/** First marketplace manifest found in `dir`, in `MARKETPLACE_MANIFEST_PATHS` order. */
export function findMarketplaceManifest(
  dir: string,
): FoundPluginManifest | undefined {
  return findFirstManifest(
    dir,
    MARKETPLACE_MANIFEST_PATHS,
    MARKETPLACE_MANIFEST_FORMATS,
  );
}

/**
 * Reads and validates a Claude-shaped plugin manifest: a JSON object with a
 * `name`; a missing `version` defaults to `1.0.0`. `pluginRoot` defaults to the
 * directory holding the manifest's `.<format>-plugin/` folder.
 */
export function loadClaudeShapedManifest(
  manifestPath: string,
  formatLabel: string,
  pluginRoot: string = path.dirname(path.dirname(manifestPath)),
): ClaudeShapedPluginManifest {
  const safePath = stripAnsiAndControl(manifestPath);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `${formatLabel} plugin configuration not found at ${safePath}`,
    );
  }
  if (!realPathWithin(manifestPath, pluginRoot)) {
    throw new Error(
      `${formatLabel} plugin configuration at ${safePath} resolves through a symlink outside the plugin`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (error) {
    throw new Error(
      stripAnsiAndControl(
        `Invalid ${formatLabel} plugin configuration at ${safePath}: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Invalid ${formatLabel} plugin configuration at ${safePath}: expected a JSON object`,
    );
  }

  const config = parsed as ClaudeShapedPluginManifest;
  if (typeof config.name !== 'string' || config.name.length === 0) {
    throw new Error(`${formatLabel} plugin config must have name field`);
  }
  return {
    ...config,
    version:
      typeof config.version === 'string' && config.version.length > 0
        ? config.version
        : '1.0.0',
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Maps the fields a Grok Build or Codex manifest adds on top of Claude's shape.
 * Codex: `interface.displayName` becomes the display name, the interface's long
 * or short description fills a missing `description`, the rest of `interface`
 * is presentation only and dropped, and `apps` (app integrations) is dropped.
 * Grok Build: language servers are not supported and are dropped.
 */
export function mapPluginManifestFields(
  manifest: ClaudeShapedPluginManifest,
  format: PluginManifestFormat,
): { config: ClaudePluginConfig; displayName?: string } {
  const {
    interface: presentation,
    apps,
    displayName: _displayName,
    ...config
  } = manifest;
  let displayName: string | undefined;

  if (format === 'Codex') {
    if (
      typeof presentation === 'object' &&
      presentation !== null &&
      !Array.isArray(presentation)
    ) {
      const fields = presentation as Record<string, unknown>;
      displayName = nonEmptyString(fields['displayName']);
      if (!nonEmptyString(config.description)) {
        const description =
          nonEmptyString(fields['longDescription']) ??
          nonEmptyString(fields['shortDescription']);
        if (description) config.description = description;
      }
    }
    if (apps !== undefined) {
      debugLogger.warn(
        `Ignoring apps in ${config.name}: app integrations are not supported.`,
      );
    }
  }

  if (format === 'Grok' && config.lspServers !== undefined) {
    debugLogger.warn(
      `Ignoring lspServers in ${config.name}: language servers from Grok Build plugins are not supported.`,
    );
    delete config.lspServers;
  }

  return { config, displayName };
}
