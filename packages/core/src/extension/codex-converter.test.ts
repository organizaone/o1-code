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
  CODEX_PLUGIN_MANIFEST,
  convertCodexPlugin,
} from './codex-converter.js';

describe('convertCodexPlugin', () => {
  let root: string;
  const converted: string[] = [];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-plugin-'));
    fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    for (const dir of converted.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function writeManifest(config: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(root, CODEX_PLUGIN_MANIFEST),
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
    const result = await convertCodexPlugin(root);
    converted.push(result.convertedDir);
    return result;
  }

  function readGenerated(dir: string): Record<string, unknown> {
    return JSON.parse(
      fs.readFileSync(path.join(dir, 'o1-code-extension.json'), 'utf-8'),
    ) as Record<string, unknown>;
  }

  it('uses the manifest path Codex defines', () => {
    expect(CODEX_PLUGIN_MANIFEST).toBe('.codex-plugin/plugin.json');
  });

  it('maps interface.displayName and keeps the manifest description', async () => {
    writeManifest({
      name: 'sample-codex-plugin',
      version: '1.2.0',
      description: 'Manifest description',
      author: { name: 'Sample Author' },
      interface: {
        displayName: 'Sample Codex Plugin',
        shortDescription: 'Short',
        longDescription: 'Long',
        brandColor: '#123456',
        defaultPrompt: ['Try it'],
      },
    });

    const result = await convert();

    expect(result.config).toMatchObject({
      name: 'sample-codex-plugin',
      version: '1.2.0',
      displayName: 'Sample Codex Plugin',
      description: 'Manifest description',
    });
    const generated = readGenerated(result.convertedDir);
    expect(generated['displayName']).toBe('Sample Codex Plugin');
    expect(generated['description']).toBe('Manifest description');
    expect(generated).not.toHaveProperty('interface');
    expect(generated).not.toHaveProperty('brandColor');
  });

  it('fills a missing description from the long, then short, interface description', async () => {
    writeManifest({
      name: 'sample-codex-plugin',
      interface: { shortDescription: 'Short', longDescription: 'Long' },
    });
    expect((await convert()).config.description).toBe('Long');

    writeManifest({
      name: 'sample-codex-plugin',
      interface: { shortDescription: 'Short' },
    });
    expect((await convert()).config.description).toBe('Short');
  });

  it('defaults the version and drops app integrations', async () => {
    writeManifest({ name: 'sample-codex-plugin', apps: './.app.json' });
    write('.app.json', JSON.stringify({ apps: {} }));

    const result = await convert();

    expect(result.config.version).toBe('1.0.0');
    const generated = readGenerated(result.convertedDir);
    expect(generated['version']).toBe('1.0.0');
    expect(generated).not.toHaveProperty('apps');
  });

  it('collects skills declared with a trailing slash', async () => {
    writeManifest({ name: 'sample-codex-plugin', skills: './skills/' });
    write(
      'skills/sample-skill/SKILL.md',
      '---\nname: sample-skill\ndescription: Synthetic skill\n---\nBody',
    );

    const result = await convert();

    expect(
      fs.existsSync(
        path.join(result.convertedDir, 'skills', 'sample-skill', 'SKILL.md'),
      ),
    ).toBe(true);
  });

  it('falls back to a root .mcp.json and maps its transports', async () => {
    writeManifest({ name: 'sample-codex-plugin' });
    write(
      '.mcp.json',
      JSON.stringify({
        mcpServers: {
          remote: { type: 'http', url: 'https://example.com/mcp' },
          local: {
            type: 'stdio',
            command: 'node',
            args: ['${PLUGIN_ROOT}/server.js'],
          },
        },
      }),
    );

    const result = await convert();

    expect(result.config.mcpServers?.['remote']).toEqual({
      httpUrl: 'https://example.com/mcp',
    });
    expect(result.config.mcpServers?.['local']).toEqual({
      command: 'node',
      args: ['${extensionPath}/server.js'],
    });
  });

  it('prefers inline mcpServers over the root .mcp.json', async () => {
    writeManifest({
      name: 'sample-codex-plugin',
      mcpServers: { inline: { command: 'inline-server' } },
    });
    write(
      '.mcp.json',
      JSON.stringify({ mcpServers: { fromFile: { command: 'file-server' } } }),
    );

    const result = await convert();

    expect(Object.keys(result.config.mcpServers ?? {})).toEqual(['inline']);
  });

  it('keeps ${PLUGIN_ROOT} in a declared hooks file for the loader to resolve', async () => {
    writeManifest({
      name: 'sample-codex-plugin',
      hooks: './hooks/hooks.json',
    });
    write(
      'hooks/hooks.json',
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'python3 ${PLUGIN_ROOT}/hooks/start.py',
                },
              ],
            },
          ],
        },
      }),
    );

    const result = await convert();

    const command = (
      result.config.hooks?.SessionStart?.[0]?.hooks?.[0] as { command: string }
    ).command;
    expect(command).toBe('python3 ${PLUGIN_ROOT}/hooks/start.py');
  });

  it('refuses a manifest that is a symlink resolving outside the plugin', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-outside-'));
    try {
      const target = path.join(outside, 'plugin.json');
      fs.writeFileSync(target, JSON.stringify({ name: 'leaked' }), 'utf-8');
      fs.symlinkSync(target, path.join(root, CODEX_PLUGIN_MANIFEST));

      await expect(convertCodexPlugin(root)).rejects.toThrow(
        /Codex plugin configuration at .* resolves through a symlink outside the plugin/,
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
