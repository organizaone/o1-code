/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

describe('loadSimpleGit', () => {
  afterEach(() => {
    vi.doUnmock('simple-git');
    vi.resetModules();
  });

  it('uses named exports and single-flights concurrent loads', async () => {
    const simpleGit = vi.fn();
    const CheckRepoActions = { IS_REPO_ROOT: 'root' };
    vi.doMock('simple-git', () => ({ CheckRepoActions, simpleGit }));
    const { loadSimpleGit } = await import('./load-simple-git.js');

    const first = loadSimpleGit();
    const second = loadSimpleGit();

    expect(second).toBe(first);
    const loaded = await first;
    expect(loaded.CheckRepoActions).toBe(CheckRepoActions);

    loaded.simpleGit('/repo');
    expect(simpleGit).toHaveBeenCalledWith('/repo', {
      config: ['core.fsmonitor=', 'log.showSignature=false'],
      unsafe: { allowUnsafeFsMonitor: true },
    });
  });

  it('keeps the guard last and preserves caller options', async () => {
    const simpleGit = vi.fn();
    vi.doMock('simple-git', () => ({
      CheckRepoActions: { IS_REPO_ROOT: 'root' },
      simpleGit,
    }));
    const { loadSimpleGit } = await import('./load-simple-git.js');
    const { simpleGit: guarded } = await loadSimpleGit();

    guarded('/repo', {
      config: ['core.quotepath=false'],
      unsafe: { allowUnsafeHooksPath: true },
    });

    // Git honours the last `-c` for a key, so ours has to come after any the
    // caller supplied.
    expect(simpleGit).toHaveBeenCalledWith('/repo', {
      config: [
        'core.quotepath=false',
        'core.fsmonitor=',
        'log.showSignature=false',
      ],
      unsafe: { allowUnsafeHooksPath: true, allowUnsafeFsMonitor: true },
    });
  });

  it('guards the options-only and no-argument overloads', async () => {
    const simpleGit = vi.fn();
    vi.doMock('simple-git', () => ({
      CheckRepoActions: { IS_REPO_ROOT: 'root' },
      simpleGit,
    }));
    const { loadSimpleGit } = await import('./load-simple-git.js');
    const { simpleGit: guarded } = await loadSimpleGit();

    guarded({ baseDir: '/repo' });
    expect(simpleGit).toHaveBeenLastCalledWith({
      baseDir: '/repo',
      config: ['core.fsmonitor=', 'log.showSignature=false'],
      unsafe: { allowUnsafeFsMonitor: true },
    });

    guarded();
    expect(simpleGit).toHaveBeenLastCalledWith({
      config: ['core.fsmonitor=', 'log.showSignature=false'],
      unsafe: { allowUnsafeFsMonitor: true },
    });
  });

  it('unwraps a default-only CommonJS chunk', async () => {
    const simpleGit = Object.assign(vi.fn(), {
      CheckRepoActions: { IS_REPO_ROOT: 'root' },
    });
    Object.assign(simpleGit, { simpleGit });
    vi.doMock('simple-git', () => ({
      CheckRepoActions: undefined,
      simpleGit: undefined,
      default: simpleGit,
    }));
    const { loadSimpleGit } = await import('./load-simple-git.js');

    const loaded = await loadSimpleGit();
    expect(loaded.CheckRepoActions).toBe(simpleGit.CheckRepoActions);
    loaded.simpleGit('/repo');
    expect(simpleGit).toHaveBeenCalledWith('/repo', {
      config: ['core.fsmonitor=', 'log.showSignature=false'],
      unsafe: { allowUnsafeFsMonitor: true },
    });
  });

  it('rejects an unexpected module shape', async () => {
    vi.doMock('simple-git', () => ({
      CheckRepoActions: undefined,
      simpleGit: undefined,
      default: {},
    }));
    const { loadSimpleGit } = await import('./load-simple-git.js');

    await expect(loadSimpleGit()).rejects.toThrow(
      'simple-git module does not match the expected API',
    );
  });

  it.each([
    ['trailer.audit.cmd=untrusted-command', 'allowUnsafeCommandBinaries'],
    ['trailer.audit.command=untrusted-command', 'allowUnsafeCommandBinaries'],
    ['include.path=untrusted-config', 'allowUnsafeInclude'],
    ['includeIf.onbranch:main.path=untrusted-config', 'allowUnsafeInclude'],
  ])(
    'rejects executable configuration %s before spawning Git',
    async (config, category) => {
      vi.doUnmock('simple-git');
      vi.resetModules();
      const { loadSimpleGit } = await import('./load-simple-git.js');
      const { simpleGit } = await loadSimpleGit();
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'guarded-git-'));
      try {
        let spawned = false;
        const git = simpleGit(tempDir, { config: [config] });
        git.outputHandler(() => {
          spawned = true;
        });

        await expect(git.version()).rejects.toThrow(category);
        expect(spawned).toBe(false);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    },
  );

  it('instructs Git to reject abbreviated executable options', async () => {
    vi.doUnmock('simple-git');
    vi.resetModules();
    const { loadSimpleGit } = await import('./load-simple-git.js');
    const { simpleGit } = await loadSimpleGit();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'guarded-git-'));
    try {
      const git = simpleGit(tempDir);
      await git.init();

      await expect(
        git.raw(['push', '--receive-p=untrusted-command']),
      ).rejects.toMatchObject({ reason: 'DISALLOWED_ABBREVIATED' });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects an explicitly supplied VISUAL editor before spawning Git', async () => {
    vi.doUnmock('simple-git');
    vi.resetModules();
    const { loadSimpleGit } = await import('./load-simple-git.js');
    const { simpleGit } = await loadSimpleGit();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'guarded-git-'));
    try {
      let spawned = false;
      const git = simpleGit(tempDir).env({ VISUAL: 'untrusted-editor' });
      git.outputHandler(() => {
        spawned = true;
      });

      await expect(git.raw(['commit', '--amend'])).rejects.toThrow(
        'allowUnsafeEditor',
      );
      expect(spawned).toBe(false);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
