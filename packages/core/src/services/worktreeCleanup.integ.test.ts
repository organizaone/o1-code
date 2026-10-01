/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  WORKTREE_SESSION_FILE,
  worktreeHasWork,
} from './gitWorktreeService.js';
import { cleanupStaleAgentWorktrees } from './worktreeCleanup.js';

const SLUG = 'agent-abc1234';
const itWhereSymlinksWork = it.skipIf(process.platform === 'win32');

describe('stale agent worktree sweep keeps work that git does not track', () => {
  vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

  let repoRoot: string;
  let worktree: string;

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' });

  const write = async (relative: string, content = 'x\n') => {
    const file = path.join(worktree, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };

  const makeStale = async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await fs.utimes(worktree, old, old);
  };

  beforeEach(async () => {
    repoRoot = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'o1-code-wt-sweep-')),
    );
    git(repoRoot, 'init', '-q', '-b', 'main');
    git(repoRoot, 'config', 'user.email', 't@e.com');
    git(repoRoot, 'config', 'user.name', 't');
    git(repoRoot, 'config', 'commit.gpgsign', 'false');
    await fs.writeFile(
      path.join(repoRoot, '.gitignore'),
      ['.env', 'node_modules/', 'dist/', '.o1-code/', ''].join('\n'),
    );
    await fs.writeFile(path.join(repoRoot, 'README.md'), 'hi\n');
    git(repoRoot, 'add', '.');
    git(repoRoot, 'commit', '-q', '-m', 'init', '--no-verify');
    worktree = path.join(repoRoot, '.o1-code', 'worktrees', SLUG);
    git(repoRoot, 'worktree', 'add', '-q', '-b', `worktree-${SLUG}`, worktree);
  });

  afterEach(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  describe('worktreeHasWork', () => {
    it('reads a clean checkout as having no work', async () => {
      expect(await worktreeHasWork(worktree)).toBe(false);
    });

    it('counts a git-ignored file such as .env as work', async () => {
      await write('.env', 'API_KEY=secret\n');
      expect(await worktreeHasWork(worktree)).toBe(true);
    });

    it('counts an untracked file as work', async () => {
      await write('notes.md');
      expect(await worktreeHasWork(worktree)).toBe(true);
    });

    it('counts a modified tracked file as work', async () => {
      await write('README.md', 'changed\n');
      expect(await worktreeHasWork(worktree)).toBe(true);
    });

    it('does not count regenerable build and dependency output', async () => {
      await write('node_modules/pkg/index.js');
      await write('dist/out.js');
      await write('packages/app/node_modules/pkg/index.js');
      expect(await worktreeHasWork(worktree)).toBe(false);
    });

    it('does not count the session marker', async () => {
      await write(WORKTREE_SESSION_FILE, 'session\n');
      expect(await worktreeHasWork(worktree)).toBe(false);
    });

    itWhereSymlinksWork(
      'does not count a symlinked directory, whose content lives elsewhere',
      async () => {
        const target = path.join(repoRoot, 'shared-cache');
        await fs.mkdir(target);
        await fs.symlink(target, path.join(worktree, 'cache'), 'dir');
        expect(await worktreeHasWork(worktree)).toBe(false);
      },
    );

    it('treats a directory that lost its .git link as having work', async () => {
      await fs.rm(path.join(worktree, '.git'));
      expect(await worktreeHasWork(worktree)).toBe(true);
    });
  });

  describe('cleanupStaleAgentWorktrees', () => {
    it('keeps a stale worktree whose only content is git-ignored', async () => {
      await write('.env', 'API_KEY=secret\n');
      await makeStale();

      expect(await cleanupStaleAgentWorktrees(repoRoot)).toBe(0);
      expect(await fs.readFile(path.join(worktree, '.env'), 'utf8')).toBe(
        'API_KEY=secret\n',
      );
    });

    it('keeps a stale worktree with an untracked file', async () => {
      await write('draft.md', 'unfinished\n');
      await makeStale();

      expect(await cleanupStaleAgentWorktrees(repoRoot)).toBe(0);
      await expect(
        fs.access(path.join(worktree, 'draft.md')),
      ).resolves.toBeUndefined();
    });

    it('still removes a stale worktree holding only build output', async () => {
      await write('node_modules/pkg/index.js');
      await makeStale();

      expect(await cleanupStaleAgentWorktrees(repoRoot)).toBe(1);
      await expect(fs.access(worktree)).rejects.toThrow();
    });
  });
});
