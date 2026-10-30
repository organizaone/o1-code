/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCurrentO1CodeCliArgv,
  buildFreshO1CodeWorkerLaunch,
} from './current-cli-argv.js';

const originalArgv = [...process.argv];
const originalDev = process.env['DEV'];

describe('buildCurrentO1CodeCliArgv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    process.argv.splice(0, process.argv.length, ...originalArgv);
    if (originalDev === undefined) {
      delete process.env['DEV'];
    } else {
      process.env['DEV'] = originalDev;
    }
  });

  it('selects the npm bootstrap for fresh workers without changing the current process pin', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-fresh-worker-'),
    );
    const bootstrap = path.join(root, 'cli-entry.js');
    await fs.writeFile(bootstrap, '');
    process.argv[1] = path.join(root, 'old-runtime', 'cli.js');
    vi.stubEnv('DEV', false);
    vi.stubEnv('O1CODE_CLI', bootstrap);
    vi.stubEnv('O1CODE_MANAGED_NPM_PIN', 'old-session-pin');
    vi.stubEnv('O1CODE_STARTUP_VERSION', '1.0.0');
    try {
      expect(
        buildFreshO1CodeWorkerLaunch(['--session-id', 'new-session']),
      ).toEqual({
        argv: [
          process.execPath,
          await fs.realpath(bootstrap),
          '--session-id',
          'new-session',
        ],
        entrypoint: await fs.realpath(bootstrap),
        env: {
          CLI_VERSION: '',
          O1CODE_STARTUP_VERSION: '',
          O1CODE_MANAGED_NPM_PIN: '',
        },
      });
      expect(
        buildCurrentO1CodeCliArgv(['--internal-agent-view-pty-host']),
      ).toEqual([
        process.execPath,
        process.argv[1],
        '--internal-agent-view-pty-host',
      ]);
      expect(process.env['O1CODE_MANAGED_NPM_PIN']).toBe('old-session-pin');
      expect(process.env['O1CODE_STARTUP_VERSION']).toBe('1.0.0');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it.each(['missing.js', 'launcher.cmd', 'entry.ts', 'relative.js'])(
    'keeps the current entrypoint when no trusted JavaScript bootstrap is available (%s)',
    async (name) => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), 'o1-code-worker-fallback-'),
      );
      const bootstrap = path.join(root, name);
      if (name !== 'missing.js') await fs.writeFile(bootstrap, '');
      process.argv[1] = path.join(root, 'current', 'cli.js');
      vi.stubEnv('DEV', false);
      vi.stubEnv('O1CODE_CLI', name === 'relative.js' ? name : bootstrap);
      try {
        expect(buildFreshO1CodeWorkerLaunch(['--resume=session'])).toEqual({
          argv: [process.execPath, process.argv[1], '--resume=session'],
          entrypoint: process.argv[1],
          env: {},
        });
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it('retains the development tsx entrypoint for fresh workers', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-worker-dev-'),
    );
    const entrypoint = path.join(root, 'packages', 'cli', 'index.ts');
    const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const bootstrap = path.join(root, 'cli-entry.js');
    await fs.mkdir(path.dirname(tsxCli), { recursive: true });
    await fs.writeFile(tsxCli, '');
    await fs.writeFile(bootstrap, '');
    process.argv[1] = entrypoint;
    process.env['DEV'] = 'true';
    vi.stubEnv('O1CODE_CLI', bootstrap);
    try {
      expect(
        buildFreshO1CodeWorkerLaunch(['--session-id', 'new-session']),
      ).toEqual({
        argv: [
          process.execPath,
          tsxCli,
          entrypoint,
          '--session-id',
          'new-session',
        ],
        entrypoint,
        env: {},
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('uses the current JavaScript entrypoint by default', () => {
    process.argv[1] = '/tmp/o1-code/dist/index.js';
    delete process.env['DEV'];

    expect(buildCurrentO1CodeCliArgv(['agents'])).toEqual([
      process.execPath,
      '/tmp/o1-code/dist/index.js',
      'agents',
    ]);
  });

  it('falls back to o1-code when process.argv[1] is undefined', () => {
    process.argv.splice(1, 1);
    delete process.env['DEV'];

    expect(buildCurrentO1CodeCliArgv(['agents'])).toEqual([
      'o1-code',
      'agents',
    ]);
  });

  it('uses local tsx for dev TypeScript entrypoints', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'o1-code-dev-argv-'));
    const entrypoint = path.join(root, 'packages', 'cli', 'index.ts');
    const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    await fs.mkdir(path.dirname(entrypoint), { recursive: true });
    await fs.mkdir(path.dirname(tsxCli), { recursive: true });
    await fs.writeFile(tsxCli, '');
    process.argv[1] = entrypoint;
    process.env['DEV'] = 'true';

    try {
      expect(buildCurrentO1CodeCliArgv(['--bg', 'hello'])).toEqual([
        process.execPath,
        tsxCli,
        entrypoint,
        '--bg',
        'hello',
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('throws when DEV=true with a TypeScript entrypoint but tsx is missing', async () => {
    const entryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-entry-argv-'),
    );
    const cwdRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-cwd-argv-'),
    );
    const entrypoint = path.join(entryRoot, 'packages', 'cli', 'index.ts');
    const cwdTsxCli = path.join(
      cwdRoot,
      'node_modules',
      'tsx',
      'dist',
      'cli.mjs',
    );
    await fs.mkdir(path.dirname(entrypoint), { recursive: true });
    await fs.mkdir(path.dirname(cwdTsxCli), { recursive: true });
    await fs.writeFile(cwdTsxCli, '');
    process.argv[1] = entrypoint;
    process.env['DEV'] = 'true';
    const originalCwd = process.cwd();

    try {
      process.chdir(cwdRoot);

      expect(() => buildCurrentO1CodeCliArgv(['agents'])).toThrow(
        /tsx was not found/,
      );
    } finally {
      process.chdir(originalCwd);
      await fs.rm(entryRoot, { recursive: true, force: true });
      await fs.rm(cwdRoot, { recursive: true, force: true });
    }
  });
});
