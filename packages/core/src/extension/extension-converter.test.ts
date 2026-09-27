/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  convertCompatibleExtension,
  SUPPORTED_EXTENSION_MANIFESTS,
} from './extension-converter.js';
import {
  AGENT_PLUGIN_SCHEMA,
  AGENT_PLUGIN_SCHEMA_PREFIX,
} from './agent-plugins-v1/index.js';

describe('Agent Plugins extension conversion', () => {
  let pluginRoot: string;

  beforeEach(() => {
    pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-plugin-'));
  });

  afterEach(() => {
    fs.rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('selects a supported Agent Plugin without converting it', async () => {
    const manifest = JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA,
      name: 'portable-plugin',
    });
    fs.writeFileSync(path.join(pluginRoot, 'plugin.json'), manifest);

    await expect(convertCompatibleExtension(pluginRoot)).resolves.toEqual({
      extensionDir: pluginRoot,
      originSource: 'AgentPlugins',
      externalContent: false,
    });
    expect(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8')).toBe(
      manifest,
    );
    expect(fs.existsSync(path.join(pluginRoot, 'o1-code-extension.json'))).toBe(
      false,
    );
  });

  it('gives an unsupported Agent Plugins schema priority over o1-code format', async () => {
    fs.writeFileSync(
      path.join(pluginRoot, 'plugin.json'),
      JSON.stringify({
        $schema: `${AGENT_PLUGIN_SCHEMA_PREFIX}2.0.0/plugin.schema.json`,
        name: 'future-plugin',
      }),
    );
    fs.writeFileSync(
      path.join(pluginRoot, 'o1-code-extension.json'),
      JSON.stringify({ name: 'o1-code-fallback', version: '1.0.0' }),
    );

    await expect(convertCompatibleExtension(pluginRoot)).rejects.toThrow(
      'Unsupported Agent Plugins schema',
    );
  });

  it('leaves an unrelated plugin.json out of format detection', async () => {
    fs.writeFileSync(
      path.join(pluginRoot, 'plugin.json'),
      JSON.stringify({ $schema: 'https://example.com/plugin.schema.json' }),
    );
    fs.writeFileSync(
      path.join(pluginRoot, 'o1-code-extension.json'),
      JSON.stringify({ name: 'o1-code-extension', version: '1.0.0' }),
    );

    await expect(convertCompatibleExtension(pluginRoot)).resolves.toEqual({
      extensionDir: pluginRoot,
      originSource: 'O1Code',
      externalContent: false,
    });
  });

  it('honors an explicit marketplace selection over a root Agent Plugin manifest', async () => {
    fs.writeFileSync(
      path.join(pluginRoot, 'plugin.json'),
      JSON.stringify({
        $schema: AGENT_PLUGIN_SCHEMA,
        name: 'root-agent-plugin',
      }),
    );
    fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({
        name: 'sample-marketplace',
        owner: { name: 'Test Owner', email: 'owner@example.com' },
        plugins: [
          {
            name: 'requested-plugin',
            version: '2.0.0',
            source: './plugin-src',
          },
        ],
      }),
    );
    const selectedRoot = path.join(pluginRoot, 'plugin-src');
    fs.mkdirSync(path.join(selectedRoot, '.claude-plugin'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(selectedRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'requested-plugin', version: '2.0.0' }),
    );
    fs.writeFileSync(
      path.join(selectedRoot, 'plugin.json'),
      JSON.stringify({
        $schema: AGENT_PLUGIN_SCHEMA,
        name: 'carried-agent-plugin',
      }),
    );

    const selected = await convertCompatibleExtension(
      pluginRoot,
      'requested-plugin',
    );
    expect(selected.originSource).toBe('Claude');
    const selectedConfig = JSON.parse(
      fs.readFileSync(
        path.join(selected.extensionDir, 'o1-code-extension.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(selectedConfig['name']).toBe('requested-plugin');
    expect(fs.existsSync(path.join(selected.extensionDir, 'plugin.json'))).toBe(
      false,
    );
    fs.rmSync(selected.extensionDir, { recursive: true, force: true });

    fs.writeFileSync(
      path.join(pluginRoot, 'plugin.json'),
      JSON.stringify({
        $schema: `${AGENT_PLUGIN_SCHEMA_PREFIX}2.0.0/plugin.schema.json`,
        name: 'future-root-agent-plugin',
      }),
    );
    fs.writeFileSync(
      path.join(selectedRoot, 'plugin.json'),
      JSON.stringify({
        $schema: `${AGENT_PLUGIN_SCHEMA_PREFIX}2.0.0/plugin.schema.json`,
        name: 'future-carried-agent-plugin',
      }),
    );
    const selectedWithFutureRoot = await convertCompatibleExtension(
      pluginRoot,
      'requested-plugin',
    );
    expect(selectedWithFutureRoot.originSource).toBe('Claude');
    expect(
      fs.existsSync(
        path.join(selectedWithFutureRoot.extensionDir, 'plugin.json'),
      ),
    ).toBe(false);
    fs.rmSync(selectedWithFutureRoot.extensionDir, {
      recursive: true,
      force: true,
    });
  });
});

describe('Grok Build and Codex plugin detection', () => {
  let pluginRoot: string;

  beforeEach(() => {
    pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-detect-'));
  });

  afterEach(() => {
    fs.rmSync(pluginRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, content: unknown): void {
    const filePath = path.join(pluginRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(content), 'utf-8');
  }

  async function detect(pluginName?: string) {
    const result = await convertCompatibleExtension(pluginRoot, pluginName);
    const config = JSON.parse(
      fs.readFileSync(
        path.join(result.extensionDir, 'o1-code-extension.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    fs.rmSync(result.extensionDir, { recursive: true, force: true });
    return { originSource: result.originSource, config };
  }

  it('lists the Grok Build and Codex manifests as installable', () => {
    expect(SUPPORTED_EXTENSION_MANIFESTS).toEqual(
      expect.arrayContaining([
        '.grok-plugin/plugin.json',
        '.codex-plugin/plugin.json',
      ]),
    );
  });

  it('converts a Grok Build plugin', async () => {
    write('.grok-plugin/plugin.json', { name: 'grok-only' });
    await expect(detect()).resolves.toMatchObject({
      originSource: 'Grok',
      config: { name: 'grok-only' },
    });
  });

  it('converts a Codex plugin', async () => {
    write('.codex-plugin/plugin.json', {
      name: 'codex-only',
      interface: { displayName: 'Codex Only' },
    });
    await expect(detect()).resolves.toMatchObject({
      originSource: 'Codex',
      config: { name: 'codex-only', displayName: 'Codex Only' },
    });
  });

  it('installs a repo carrying Claude and Codex manifests as Claude', async () => {
    write('.claude-plugin/plugin.json', {
      name: 'from-claude',
      version: '1.0.0',
    });
    write('.codex-plugin/plugin.json', { name: 'from-codex' });
    await expect(detect()).resolves.toMatchObject({
      originSource: 'Claude',
      config: { name: 'from-claude' },
    });
  });

  it('prefers the Grok Build manifest over the Codex one', async () => {
    write('.grok-plugin/plugin.json', { name: 'from-grok' });
    write('.codex-plugin/plugin.json', { name: 'from-codex' });
    await expect(detect()).resolves.toMatchObject({
      originSource: 'Grok',
      config: { name: 'from-grok' },
    });
  });

  it('keeps a root Agent Plugins manifest ahead of a Codex manifest', async () => {
    write('plugin.json', { $schema: AGENT_PLUGIN_SCHEMA, name: 'portable' });
    write('.codex-plugin/plugin.json', { name: 'from-codex' });
    await expect(convertCompatibleExtension(pluginRoot)).resolves.toEqual({
      extensionDir: pluginRoot,
      originSource: 'AgentPlugins',
      externalContent: false,
    });
  });

  it('reports Grok for a plugin selected from a Grok Build marketplace', async () => {
    write('.grok-plugin/marketplace.json', {
      name: 'grok-marketplace',
      owner: { name: 'Owner' },
      plugins: [
        {
          name: 'claude-shaped',
          source: { source: 'local', path: './plugins/claude-shaped' },
          domains: ['example.com'],
        },
      ],
    });
    write('plugins/claude-shaped/.claude-plugin/plugin.json', {
      name: 'claude-shaped',
      version: '1.0.0',
    });
    await expect(detect('claude-shaped')).resolves.toMatchObject({
      originSource: 'Grok',
      config: { name: 'claude-shaped' },
    });
  });

  it('reports Codex for a plugin selected from a Codex marketplace', async () => {
    write('.agents/plugins/marketplace.json', {
      name: 'codex-marketplace',
      interface: { displayName: 'Codex Marketplace' },
      plugins: [
        {
          name: 'codex-plugin',
          source: { source: 'local', path: './plugins/codex-plugin' },
          policy: { installation: 'AVAILABLE' },
        },
      ],
    });
    write('plugins/codex-plugin/.codex-plugin/plugin.json', {
      name: 'codex-plugin',
      interface: { displayName: 'Codex Plugin' },
    });
    await expect(detect('codex-plugin')).resolves.toMatchObject({
      originSource: 'Codex',
      config: {
        name: 'codex-plugin',
        version: '1.0.0',
        displayName: 'Codex Plugin',
      },
    });
  });
});
