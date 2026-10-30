/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  verifyUpdatedNpmLauncher,
  relaunchUpdatedNpmApplication,
} from './managed-update-restart.js';

const { exec, spawn } = vi.hoisted(() => ({ exec: vi.fn(), spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: exec, spawn }));

describe('managed update restart', () => {
  const originalArgv = process.argv;
  beforeEach(() => {
    vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);
    vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
    process.argv = [process.execPath, '/original/install/cli.js'];
    vi.stubEnv('O1CODE_CLI', '/original/install/cli-entry.js');
    vi.stubEnv('O1CODE_MANAGED_NPM_PIN', 'old-session-pin');
    vi.stubEnv('O1CODE_STARTUP_VERSION', '1.0.0');
    vi.stubEnv('CLI_VERSION', '1.0.0');
    exec.mockImplementation((_file, args, _options, callback) =>
      callback(null, {
        stdout: args.includes('--version') ? '2.0.0\n' : 'Usage: CLI\n',
      }),
    );
    spawn.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 0));
      return child;
    });
  });
  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('releases stdin before the inherited child starts and keeps it paused until the child closes', async () => {
    const child = new EventEmitter();
    let pausedBeforeSpawn = false;
    spawn.mockImplementation(() => {
      pausedBeforeSpawn =
        vi.mocked(process.stdin.pause).mock.calls.length === 1;
      return child;
    });
    const restarted = relaunchUpdatedNpmApplication('session-id');
    const resumedBeforeExit =
      vi.mocked(process.stdin.resume).mock.calls.length > 0;
    child.emit('close', 0);
    await expect(restarted).resolves.toBe(0);
    expect(pausedBeforeSpawn).toBe(true);
    expect(resumedBeforeExit).toBe(false);
    expect(process.stdin.resume).toHaveBeenCalledOnce();
  });

  it('restores stdin if the inherited child cannot start', async () => {
    spawn.mockImplementation(() => {
      throw new Error('Spawn denied');
    });
    await expect(relaunchUpdatedNpmApplication('session-id')).rejects.toThrow(
      'Spawn denied',
    );
    expect(process.stdin.pause).toHaveBeenCalledOnce();
    expect(process.stdin.resume).toHaveBeenCalledOnce();
  });

  it('keeps an empty new conversation id without requesting a nonexistent transcript', async () => {
    await relaunchUpdatedNpmApplication('empty-session', 'plan', false);
    expect(spawn.mock.calls[0][1]).toEqual([
      '/original/install/cli-entry.js',
      '--approval-mode',
      'plan',
      '--session-id',
      'empty-session',
    ]);
  });

  it('checks the exact bootstrap in a fresh environment before closing the session', async () => {
    await verifyUpdatedNpmLauncher('2.0.0');
    expect(exec).toHaveBeenCalledWith(
      process.execPath,
      ['/original/install/cli-entry.js', '--version'],
      expect.objectContaining({
        env: expect.not.objectContaining({
          CLI_VERSION: '1.0.0',
          O1CODE_MANAGED_NPM_PIN: 'old-session-pin',
        }),
      }),
      expect.any(Function),
    );
    expect(exec).toHaveBeenCalledWith(
      process.execPath,
      ['/original/install/cli-entry.js', '--help'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('rejects an unchanged effective launcher version', async () => {
    exec.mockImplementation((_file, _args, _options, callback) =>
      callback(null, { stdout: '1.0.0\n' }),
    );
    await expect(verifyUpdatedNpmLauncher('2.0.0')).rejects.toThrow(/1\.0\.0/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('relaunches through the original bootstrap and resumes the same session', async () => {
    await expect(relaunchUpdatedNpmApplication('session-id')).resolves.toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/original/install/cli-entry.js', '--resume', 'session-id'],
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({ O1CODE_SKIP_UPDATE_CHECK_ONCE: 'true' }),
      }),
    );
    const env = spawn.mock.calls[0][2].env as NodeJS.ProcessEnv;
    expect(env['O1CODE_MANAGED_NPM_PIN']).toBeUndefined();
    expect(env['O1CODE_STARTUP_VERSION']).toBeUndefined();
    expect(env['CLI_VERSION']).toBeUndefined();
  });

  it('propagates an unsuccessful restarted runtime exit', async () => {
    spawn.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 7));
      return child;
    });
    await expect(relaunchUpdatedNpmApplication('session-id')).resolves.toBe(7);
  });

  it('preserves launch policies and model selection without replaying the old prompt', async () => {
    process.argv = [
      process.execPath,
      '/old/cli.js',
      '--approval-mode',
      'plan',
      '--safe-mode',
      '--sandbox',
      '--model',
      'custom-model',
      '--resume=old-id',
      '--prompt-interactive',
      'old prompt',
    ];
    await relaunchUpdatedNpmApplication('new-id');
    expect(spawn.mock.calls[0][1]).toEqual([
      '/original/install/cli-entry.js',
      '--approval-mode',
      'plan',
      '--safe-mode',
      '--sandbox',
      '--model',
      'custom-model',
      '--resume',
      'new-id',
    ]);
  });

  it('uses the current approval mode when it changed during the conversation', async () => {
    process.argv = [
      process.execPath,
      '/old/cli.js',
      '--yolo',
      '--approval-mode=auto',
      '--bare',
    ];
    await relaunchUpdatedNpmApplication('new-id', 'plan');
    expect(spawn.mock.calls[0][1]).toEqual([
      '/original/install/cli-entry.js',
      '--bare',
      '--approval-mode',
      'plan',
      '--resume',
      'new-id',
    ]);
  });

  it('replaces managed worker session selectors before appending resume', async () => {
    process.argv = [
      process.execPath,
      '/old/cli.js',
      '--session-id',
      'old-session',
      '--sandbox-session-id=old-sandbox',
      '--approval-mode',
      'plan',
    ];
    await relaunchUpdatedNpmApplication('new-session');
    expect(spawn.mock.calls[0][1]).toEqual([
      '/original/install/cli-entry.js',
      '--approval-mode',
      'plan',
      '--resume',
      'new-session',
    ]);
  });

  it('preserves explicit false values for security and telemetry flags', async () => {
    process.argv = [
      process.execPath,
      '/old/cli.js',
      '--insecure',
      'false',
      '--telemetry',
      'false',
      '--sandbox',
      'false',
      '--yolo',
      'false',
    ];
    await relaunchUpdatedNpmApplication('new-id', 'plan');
    expect(spawn.mock.calls[0][1]).toEqual([
      '/original/install/cli-entry.js',
      '--insecure',
      'false',
      '--telemetry',
      'false',
      '--sandbox',
      'false',
      '--approval-mode',
      'plan',
      '--resume',
      'new-id',
    ]);
  });
});
