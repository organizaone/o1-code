/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  findMarketplaceManifest,
  findPluginManifest,
  isMarketplaceOriginSource,
  loadClaudeShapedManifest,
  MARKETPLACE_MANIFEST_PATHS,
  PLUGIN_MANIFEST_PATHS,
} from './plugin-manifest.js';

describe('plugin manifest lookup', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-manifest-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function write(relativePath: string, content: unknown): string {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      typeof content === 'string' ? content : JSON.stringify(content),
      'utf-8',
    );
    return filePath;
  }

  it('lists the plugin and marketplace manifest paths in lookup order', () => {
    expect(PLUGIN_MANIFEST_PATHS).toEqual([
      '.claude-plugin/plugin.json',
      '.grok-plugin/plugin.json',
      '.codex-plugin/plugin.json',
    ]);
    expect(MARKETPLACE_MANIFEST_PATHS).toEqual([
      '.claude-plugin/marketplace.json',
      '.grok-plugin/marketplace.json',
      '.agents/plugins/marketplace.json',
    ]);
  });

  it('returns undefined when no manifest exists', () => {
    expect(findPluginManifest(root)).toBeUndefined();
    expect(findMarketplaceManifest(root)).toBeUndefined();
  });

  it('prefers the Claude plugin manifest, then Grok, then Codex', () => {
    write('.codex-plugin/plugin.json', { name: 'p' });
    expect(findPluginManifest(root)).toEqual({
      path: path.join(root, '.codex-plugin', 'plugin.json'),
      format: 'Codex',
    });
    write('.grok-plugin/plugin.json', { name: 'p' });
    expect(findPluginManifest(root)?.format).toBe('Grok');
    write('.claude-plugin/plugin.json', { name: 'p' });
    expect(findPluginManifest(root)?.format).toBe('Claude');
  });

  it('reports the marketplace format by the path that matched', () => {
    write('.agents/plugins/marketplace.json', { name: 'm', plugins: [] });
    expect(findMarketplaceManifest(root)).toEqual({
      path: path.join(root, '.agents', 'plugins', 'marketplace.json'),
      format: 'Codex',
    });
    write('.grok-plugin/marketplace.json', { name: 'm', plugins: [] });
    expect(findMarketplaceManifest(root)?.format).toBe('Grok');
    write('.claude-plugin/marketplace.json', { name: 'm', plugins: [] });
    expect(findMarketplaceManifest(root)?.format).toBe('Claude');
  });

  it('skips a manifest that is a symlink resolving outside the directory', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-outside-'));
    try {
      const target = path.join(outside, 'plugin.json');
      fs.writeFileSync(target, JSON.stringify({ name: 'leaked' }), 'utf-8');
      fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
      fs.symlinkSync(target, path.join(root, '.claude-plugin', 'plugin.json'));
      write('.codex-plugin/plugin.json', { name: 'p' });

      expect(findPluginManifest(root)?.format).toBe('Codex');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('recognizes the marketplace origin sources', () => {
    expect(isMarketplaceOriginSource('Claude')).toBe(true);
    expect(isMarketplaceOriginSource('Grok')).toBe(true);
    expect(isMarketplaceOriginSource('Codex')).toBe(true);
    expect(isMarketplaceOriginSource('Qoder')).toBe(false);
    expect(isMarketplaceOriginSource(undefined)).toBe(false);
  });

  describe('loadClaudeShapedManifest', () => {
    it('loads the manifest and defaults a missing version', () => {
      const manifest = write('.grok-plugin/plugin.json', {
        name: 'sample',
        description: 'A plugin',
        keywords: ['x'],
      });
      expect(loadClaudeShapedManifest(manifest, 'Grok')).toEqual({
        name: 'sample',
        version: '1.0.0',
        description: 'A plugin',
        keywords: ['x'],
      });
    });

    it('keeps a declared version', () => {
      const manifest = write('.codex-plugin/plugin.json', {
        name: 'sample',
        version: '2.1.0',
      });
      expect(loadClaudeShapedManifest(manifest, 'Codex').version).toBe('2.1.0');
    });

    it('requires a name', () => {
      const manifest = write('.grok-plugin/plugin.json', { version: '1.0.0' });
      expect(() => loadClaudeShapedManifest(manifest, 'Grok')).toThrow(
        'Grok plugin config must have name field',
      );
    });

    it('rejects a manifest that is not a JSON object', () => {
      const manifest = write('.codex-plugin/plugin.json', '[1, 2]');
      expect(() => loadClaudeShapedManifest(manifest, 'Codex')).toThrow(
        /Invalid Codex plugin configuration at .*expected a JSON object/,
      );
    });

    it('strips control sequences from a JSON parse error', () => {
      const manifest = write(
        '.codex-plugin/plugin.json',
        '{"name": "\u001b[31m',
      );
      let message = '';
      try {
        loadClaudeShapedManifest(manifest, 'Codex');
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/^Invalid Codex plugin configuration at /);
      expect(message).not.toContain('\u001b');
    });

    it('throws when the manifest is missing', () => {
      expect(() =>
        loadClaudeShapedManifest(
          path.join(root, '.grok-plugin', 'plugin.json'),
          'Grok',
        ),
      ).toThrow(/Grok plugin configuration not found at/);
    });

    it('refuses a manifest that is a symlink resolving outside the plugin', () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-outside-'));
      try {
        const target = path.join(outside, 'plugin.json');
        fs.writeFileSync(target, JSON.stringify({ name: 'leaked' }), 'utf-8');
        fs.mkdirSync(path.join(root, '.grok-plugin'), { recursive: true });
        const manifest = path.join(root, '.grok-plugin', 'plugin.json');
        fs.symlinkSync(target, manifest);

        expect(() => loadClaudeShapedManifest(manifest, 'Grok')).toThrow(
          /resolves through a symlink outside the plugin/,
        );
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });
});
