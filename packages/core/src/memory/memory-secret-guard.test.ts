/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkMemorySecrets } from './memory-secret-guard.js';
import {
  clearAutoMemoryRootCache,
  getAutoMemoryRoot,
  getTeamAutoMemoryRoot,
  getUserAutoMemoryRoot,
} from './paths.js';

describe('checkMemorySecrets', () => {
  let projectRoot: string;
  let memoryBaseDir: string;
  let previousBaseDir: string | undefined;
  let teamFile: string;
  let outsideFile: string;
  const secret = `ghp_${'a'.repeat(36)}`;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-code-guard-'));
    memoryBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-code-mem-'));
    previousBaseDir = process.env['O1CODE_MEMORY_BASE_DIR'];
    process.env['O1CODE_MEMORY_BASE_DIR'] = memoryBaseDir;
    clearAutoMemoryRootCache();
    fs.mkdirSync(path.join(projectRoot, '.git'));
    teamFile = path.join(getTeamAutoMemoryRoot(projectRoot), 'feedback/x.md');
    outsideFile = path.join(projectRoot, 'src/config.ts');
  });

  afterEach(() => {
    if (previousBaseDir === undefined) {
      delete process.env['O1CODE_MEMORY_BASE_DIR'];
    } else {
      process.env['O1CODE_MEMORY_BASE_DIR'] = previousBaseDir;
    }
    clearAutoMemoryRootCache();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(memoryBaseDir, { recursive: true, force: true });
  });

  it('blocks a secret written to a team path', () => {
    const msg = checkMemorySecrets(teamFile, `token=${secret}`, projectRoot);
    expect(msg).toMatch(
      /team memory is shared with all repository collaborators/i,
    );
    expect(msg).toContain('GitHub PAT');
    expect(msg).not.toContain(secret);
  });

  it('blocks a secret written to project memory', () => {
    const projectFile = path.join(
      getAutoMemoryRoot(projectRoot),
      'reference/deploy.md',
    );
    const msg = checkMemorySecrets(projectFile, `token=${secret}`, projectRoot);
    expect(msg).toMatch(/sent to the model in future sessions/i);
    expect(msg).toContain('GitHub PAT');
    expect(msg).not.toContain(secret);
  });

  it('blocks a secret written to user memory', () => {
    const userFile = path.join(getUserAutoMemoryRoot(), 'user/profile.md');
    expect(
      checkMemorySecrets(userFile, `token=${secret}`, projectRoot),
    ).toMatch(/sent to the model in future sessions/i);
  });

  it('allows clean content on every memory path', () => {
    for (const file of [
      teamFile,
      path.join(getAutoMemoryRoot(projectRoot), 'feedback/tests.md'),
      path.join(getUserAutoMemoryRoot(), 'user/profile.md'),
    ]) {
      expect(
        checkMemorySecrets(
          file,
          'Use real DBs in integration tests.',
          projectRoot,
        ),
      ).toBeNull();
    }
  });

  it('ignores secrets written outside the memory directories', () => {
    expect(
      checkMemorySecrets(outsideFile, `token=${secret}`, projectRoot),
    ).toBeNull();
  });

  it('blocks secrets written through a symlink into team memory', () => {
    const root = getTeamAutoMemoryRoot(projectRoot);
    fs.mkdirSync(root, { recursive: true });
    const alias = path.join(projectRoot, 'alias');
    fs.symlinkSync(root, alias, 'dir');

    expect(
      checkMemorySecrets(
        path.join(alias, 'leak.md'),
        `token=${secret}`,
        projectRoot,
      ),
    ).toMatch(/team memory is shared/i);
  });
});
