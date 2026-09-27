/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LspConfigLoader } from './LspConfigLoader.js';
import type { Extension } from '../extension/extensionManager.js';

function writeLspConfig(dir: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.lsp.json'), content);
}

describe('LspConfigLoader config-driven behavior', () => {
  let tempRoot: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-config-loader-'));
    workspaceRoot = path.join(tempRoot, 'workspace');
    fs.mkdirSync(workspaceRoot);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('does not generate any presets when no user or extension config provided', () => {
    const loader = new LspConfigLoader(workspaceRoot);
    // Even if languages are detected, no built-in presets should be generated
    const configs = loader.mergeConfigs(['java', 'cpp', 'typescript'], [], []);

    expect(configs).toHaveLength(0);
  });

  it('respects user-provided configs via .lsp.json', () => {
    const loader = new LspConfigLoader(workspaceRoot);
    const userConfigs = [
      {
        name: 'jdtls',
        languages: ['java'],
        command: 'jdtls',
        args: [],
        transport: 'stdio' as const,
        initializationOptions: {},
        rootUri: 'file:///workspace',
        workspaceFolder: workspaceRoot,
        trustRequired: true,
      },
    ];

    const configs = loader.mergeConfigs(['java'], [], userConfigs);

    expect(configs).toHaveLength(1);
    expect(configs[0]?.name).toBe('jdtls');
    expect(configs[0]?.languages).toEqual(['java']);
  });

  it('respects extension-provided configs', () => {
    const loader = new LspConfigLoader(workspaceRoot);
    const extensionConfigs = [
      {
        name: 'clangd',
        languages: ['cpp', 'c'],
        command: 'clangd',
        args: ['--background-index'],
        transport: 'stdio' as const,
        initializationOptions: {},
        rootUri: 'file:///workspace',
        workspaceFolder: workspaceRoot,
        trustRequired: true,
      },
    ];

    const configs = loader.mergeConfigs(['cpp'], extensionConfigs, []);

    expect(configs).toHaveLength(1);
    expect(configs[0]?.name).toBe('clangd');
    expect(configs[0]?.command).toBe('clangd');
  });

  it('user configs override extension configs with same name', () => {
    const loader = new LspConfigLoader(workspaceRoot);
    const extensionConfigs = [
      {
        name: 'jdtls',
        languages: ['java'],
        command: 'jdtls',
        args: [],
        transport: 'stdio' as const,
        initializationOptions: {},
        rootUri: 'file:///workspace',
        workspaceFolder: workspaceRoot,
        trustRequired: true,
      },
    ];
    const userConfigs = [
      {
        name: 'jdtls',
        languages: ['java'],
        command: '/custom/path/jdtls',
        args: ['--custom-flag'],
        transport: 'stdio' as const,
        initializationOptions: {},
        rootUri: 'file:///workspace',
        workspaceFolder: workspaceRoot,
        trustRequired: true,
      },
    ];

    const configs = loader.mergeConfigs(
      ['java'],
      extensionConfigs,
      userConfigs,
    );

    expect(configs).toHaveLength(1);
    expect(configs[0]?.command).toBe('/custom/path/jdtls');
    expect(configs[0]?.args).toEqual(['--custom-flag']);
  });

  it('accepts valid string socket ports from .lsp.json', async () => {
    writeLspConfig(
      workspaceRoot,
      JSON.stringify({
        typescript: {
          transport: 'tcp',
          host: '127.0.0.1',
          port: '1234',
        },
      }),
    );

    const loader = new LspConfigLoader(workspaceRoot);
    const configs = await loader.loadUserConfigs();

    expect(configs).toHaveLength(1);
    expect(configs[0]?.socket).toEqual({
      host: '127.0.0.1',
      port: 1234,
    });
  });

  it('rejects malformed socket ports from .lsp.json', async () => {
    for (const port of ['1.5', '0x10', 1.5, 0, 65_536]) {
      writeLspConfig(
        workspaceRoot,
        JSON.stringify({
          typescript: {
            transport: 'tcp',
            host: '127.0.0.1',
            port,
          },
        }),
      );

      const loader = new LspConfigLoader(workspaceRoot);
      const configs = await loader.loadUserConfigs();

      expect(configs, `port ${JSON.stringify(port)}`).toHaveLength(0);
    }
  });

  it('strict user config loading rejects invalid server entries', async () => {
    writeLspConfig(
      workspaceRoot,
      JSON.stringify({
        typescript: {
          transport: 'stdio',
        },
      }),
    );

    const loader = new LspConfigLoader(workspaceRoot);
    const result = await loader.loadUserConfigsStrict();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(
        `Invalid LSP server config in ${path.join(workspaceRoot, '.lsp.json')}: typescript`,
      );
    }
  });

  it('strict user config loading accepts empty object as explicit empty config', async () => {
    writeLspConfig(workspaceRoot, JSON.stringify({}));

    const loader = new LspConfigLoader(workspaceRoot);
    const result = await loader.loadUserConfigsStrict();

    expect(result).toEqual({ ok: true, configs: [] });
  });

  it('strict user config loading treats deleted config as empty', async () => {
    const loader = new LspConfigLoader(workspaceRoot);
    const result = await loader.loadUserConfigsStrict();

    expect(result).toEqual({ ok: true, configs: [] });
  });

  it('non-strict user config loading skips invalid entries without rejecting all configs', async () => {
    writeLspConfig(
      workspaceRoot,
      JSON.stringify({
        typescript: {
          command: 'typescript-language-server',
        },
        invalid: {
          transport: 'stdio',
        },
      }),
    );

    const loader = new LspConfigLoader(workspaceRoot);
    const configs = await loader.loadUserConfigs();

    expect(configs).toHaveLength(1);
    expect(configs[0]?.name).toBe('typescript-language-server');
  });

  it('non-strict user config loading returns empty configs for malformed JSON', async () => {
    writeLspConfig(workspaceRoot, '{');

    const loader = new LspConfigLoader(workspaceRoot);
    const configs = await loader.loadUserConfigs();

    expect(configs).toEqual([]);
  });

  it('forces user configs to require trusted workspaces', async () => {
    writeLspConfig(
      workspaceRoot,
      JSON.stringify({
        typescript: {
          command: 'typescript-language-server',
          trustRequired: false,
        },
      }),
    );

    const loader = new LspConfigLoader(workspaceRoot);

    await expect(loader.loadUserConfigs()).resolves.toEqual([
      expect.objectContaining({ trustRequired: true }),
    ]);
    await expect(loader.loadUserConfigsStrict()).resolves.toEqual({
      ok: true,
      configs: [expect.objectContaining({ trustRequired: true })],
    });
  });
});

describe('LspConfigLoader extension configs', () => {
  let tempRoot: string;
  let workspaceRoot: string;
  let extensionPath: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-config-loader-'));
    workspaceRoot = path.join(tempRoot, 'workspace');
    extensionPath = path.join(tempRoot, 'extensions', 'ts-plugin');
    fs.mkdirSync(workspaceRoot);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('loads inline lspServers config from extension', async () => {
    const loader = new LspConfigLoader(workspaceRoot);
    const extension = {
      id: 'ts-plugin',
      name: 'ts-plugin',
      version: '1.0.0',
      isActive: true,
      path: extensionPath,
      contextFiles: [],
      config: {
        name: 'ts-plugin',
        version: '1.0.0',
        lspServers: {
          typescript: {
            command: 'typescript-language-server',
            args: ['--stdio'],
            extensionToLanguage: {
              '.ts': 'typescript',
            },
          },
        },
      },
    } as Extension;

    const configs = await loader.loadExtensionConfigs([extension]);

    expect(configs).toHaveLength(1);
    expect(configs[0]?.languages).toEqual(['typescript']);
    expect(configs[0]?.command).toBe('typescript-language-server');
    expect(configs[0]?.args).toEqual(['--stdio']);
  });

  it('loads lspServers config from referenced file and hydrates variables', async () => {
    writeLspConfig(
      extensionPath,
      JSON.stringify({
        typescript: {
          command: 'typescript-language-server',
          args: ['--stdio'],
          env: {
            EXT_ROOT: '${CLAUDE_PLUGIN_ROOT}',
          },
          extensionToLanguage: {
            '.ts': 'typescript',
          },
        },
      }),
    );

    const loader = new LspConfigLoader(workspaceRoot);
    const extension = {
      id: 'ts-plugin',
      name: 'ts-plugin',
      version: '1.0.0',
      isActive: true,
      path: extensionPath,
      contextFiles: [],
      config: {
        name: 'ts-plugin',
        version: '1.0.0',
        lspServers: './.lsp.json',
      },
    } as Extension;

    const configs = await loader.loadExtensionConfigs([extension]);

    expect(configs).toHaveLength(1);
    expect(configs[0]?.env?.['EXT_ROOT']).toBe(extensionPath);
  });
});
