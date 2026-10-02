/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from '../config/config.js';
import {
  isOutsideWorkspaceDirectory,
  outsideWorkspaceDirectoryWarning,
} from './outside-workspace-directory.js';

const itWhereSymlinksWork = it.skipIf(process.platform === 'win32');

function configWithWorkspace(root: string): Config {
  return {
    getWorkspaceContext: () => ({
      isPathWithinWorkspace: (candidate: string) => candidate.startsWith(root),
    }),
  } as unknown as Config;
}

describe('isOutsideWorkspaceDirectory', () => {
  it('is false without a directory and inside the workspace', () => {
    const config = configWithWorkspace('/work');
    expect(isOutsideWorkspaceDirectory(config, undefined)).toBe(false);
    expect(isOutsideWorkspaceDirectory(config, '/work/sub')).toBe(false);
  });

  it('is true outside the workspace', () => {
    expect(
      isOutsideWorkspaceDirectory(configWithWorkspace('/work'), '/else'),
    ).toBe(true);
  });
});

describe('outsideWorkspaceDirectoryWarning', () => {
  const created: string[] = [];
  afterEach(() => {
    for (const dir of created.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names the directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-outside-'));
    created.push(dir);
    const real = fs.realpathSync(dir);
    expect(outsideWorkspaceDirectoryWarning(real)).toBe(
      `This command runs outside the workspace, in '${real}'.`,
    );
  });

  itWhereSymlinksWork('names where a link really points', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-outside-link-'));
    created.push(base);
    const target = path.join(base, 'target');
    fs.mkdirSync(target);
    const link = path.join(base, 'link');
    fs.symlinkSync(target, link, 'dir');
    const realBase = fs.realpathSync(base);
    expect(outsideWorkspaceDirectoryWarning(link)).toBe(
      `This command runs outside the workspace, in '${link}' (a link to '${path.join(realBase, 'target')}').`,
    );
  });
});
