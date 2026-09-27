/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { convertGrokPlugin, GROK_PLUGIN_MANIFEST } from './grok-converter.js';

describe('convertGrokPlugin', () => {
  let root: string;
  const converted: string[] = [];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-plugin-'));
    fs.mkdirSync(path.join(root, '.grok-plugin'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    for (const dir of converted.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function writeManifest(config: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(root, GROK_PLUGIN_MANIFEST),
      JSON.stringify(config),
      'utf-8',
    );
  }

  function write(relativePath: string, content: string): void {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  async function convert() {
    const result = await convertGrokPlugin(root);
    converted.push(result.convertedDir);
    return result;
  }

  function readGenerated(dir: string): Record<string, unknown> {
    return JSON.parse(
      fs.readFileSync(path.join(dir, 'o1-code-extension.json'), 'utf-8'),
    ) as Record<string, unknown>;
  }

  it('uses the manifest path Grok Build defines', () => {
    expect(GROK_PLUGIN_MANIFEST).toBe('.grok-plugin/plugin.json');
  });

  it('converts metadata and the Claude directory conventions', async () => {
    writeManifest({
      name: 'sample-grok-plugin',
      version: '0.3.0',
      description: 'A synthetic Grok Build plugin',
      author: { name: 'Sample', url: 'https://example.com' },
      repository: 'https://example.com/repo',
      license: 'Apache-2.0',
      keywords: ['sample'],
    });
    write(
      'skills/sample-skill/SKILL.md',
      '---\nname: sample-skill\ndescription: Synthetic skill\n---\nBody',
    );
    write('commands/sample.md', '# Sample command');
    write(
      'agents/sample.md',
      '---\nname: sample\ndescription: Synthetic agent\ntools: Bash, Read\n---\nPrompt',
    );

    const result = await convert();

    expect(result.config).toMatchObject({
      name: 'sample-grok-plugin',
      version: '0.3.0',
      description: 'A synthetic Grok Build plugin',
    });
    for (const file of [
      'skills/sample-skill/SKILL.md',
      'commands/sample.md',
      'agents/sample.md',
    ]) {
      expect(fs.existsSync(path.join(result.convertedDir, file))).toBe(true);
    }
    expect(
      fs.readFileSync(
        path.join(result.convertedDir, 'agents', 'sample.md'),
        'utf-8',
      ),
    ).toContain('Shell');
    expect(readGenerated(result.convertedDir)).toMatchObject({
      name: 'sample-grok-plugin',
      version: '0.3.0',
      description: 'A synthetic Grok Build plugin',
    });
  });

  it('defaults a missing version', async () => {
    writeManifest({ name: 'sample-grok-plugin' });
    const result = await convert();
    expect(result.config.version).toBe('1.0.0');
    expect(readGenerated(result.convertedDir)['version']).toBe('1.0.0');
  });

  it('falls back to a root .mcp.json and rewrites ${GROK_PLUGIN_ROOT}', async () => {
    writeManifest({ name: 'sample-grok-plugin' });
    write(
      '.mcp.json',
      JSON.stringify({
        mcpServers: {
          remote: { type: 'sse', url: 'https://example.com/sse' },
          local: {
            command: '${GROK_PLUGIN_ROOT}/bin/server',
            env: { DATA: '${GROK_PLUGIN_ROOT}/data' },
          },
        },
      }),
    );

    const result = await convert();

    expect(result.config.mcpServers?.['remote']).toEqual({
      url: 'https://example.com/sse',
    });
    expect(result.config.mcpServers?.['local']).toEqual({
      command: '${extensionPath}/bin/server',
      env: { DATA: '${extensionPath}/data' },
    });
  });

  it('loads mcpServers from a declared file path', async () => {
    writeManifest({ name: 'sample-grok-plugin', mcpServers: './mcp.json' });
    write(
      'mcp.json',
      JSON.stringify({ mcpServers: { declared: { command: 'server' } } }),
    );

    const result = await convert();

    expect(result.config.mcpServers).toEqual({
      declared: { command: 'server' },
    });
  });

  it('keeps ${GROK_PLUGIN_ROOT} in a declared hooks file for the loader to resolve', async () => {
    writeManifest({ name: 'sample-grok-plugin', hooks: './hooks/hooks.json' });
    write(
      'hooks/hooks.json',
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: 'command',
                  command: '${GROK_PLUGIN_ROOT}/hooks/check.sh',
                },
              ],
            },
          ],
        },
      }),
    );

    const result = await convert();

    const command = (
      result.config.hooks?.PreToolUse?.[0]?.hooks?.[0] as { command: string }
    ).command;
    expect(command).toBe('${GROK_PLUGIN_ROOT}/hooks/check.sh');
  });

  it('skips language servers', async () => {
    writeManifest({
      name: 'sample-grok-plugin',
      lspServers: { sample: { command: 'sample-lsp' } },
    });
    write('.lsp.json', JSON.stringify({ sample: { command: 'sample-lsp' } }));

    const result = await convert();

    expect(result.config.lspServers).toBeUndefined();
    expect(readGenerated(result.convertedDir)).not.toHaveProperty('lspServers');
  });

  it('refuses a manifest that is a symlink resolving outside the plugin', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-outside-'));
    try {
      const target = path.join(outside, 'plugin.json');
      fs.writeFileSync(target, JSON.stringify({ name: 'leaked' }), 'utf-8');
      fs.symlinkSync(target, path.join(root, GROK_PLUGIN_MANIFEST));

      await expect(convertGrokPlugin(root)).rejects.toThrow(
        /Grok plugin configuration at .* resolves through a symlink outside the plugin/,
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
