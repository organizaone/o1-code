/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { getUserSettingsDir, getUserSettingsPath } from './settings.js';
import { getTrustedFoldersPath } from './trustedFolders.js';

// Regression guard: `O1CODE_HOME` is resolved by `preResolveHomeEnvOverrides()`
// AFTER any module that imports a settings/trustedFolders path has loaded.
// A top-level `const` would freeze the pre-bootstrap value and split state
// across callers. Each test mutates `process.env.O1CODE_HOME` post-load and
// asserts the exported path getters reflect the new value.

describe('settings/trustedFolders path getters are lazy', () => {
  let originalO1CodeHome: string | undefined;
  let originalTrustedPath: string | undefined;

  beforeEach(() => {
    originalO1CodeHome = process.env['O1CODE_HOME'];
    originalTrustedPath = process.env['O1CODE_TRUSTED_FOLDERS_PATH'];
    delete process.env['O1CODE_HOME'];
    delete process.env['O1CODE_TRUSTED_FOLDERS_PATH'];
  });

  afterEach(() => {
    if (originalO1CodeHome === undefined) delete process.env['O1CODE_HOME'];
    else process.env['O1CODE_HOME'] = originalO1CodeHome;
    if (originalTrustedPath === undefined)
      delete process.env['O1CODE_TRUSTED_FOLDERS_PATH'];
    else process.env['O1CODE_TRUSTED_FOLDERS_PATH'] = originalTrustedPath;
  });

  it('getUserSettingsPath() reflects O1CODE_HOME set after module load', () => {
    const defaultPath = getUserSettingsPath();
    expect(defaultPath).toBe(path.join(homedir(), '.o1-code', 'settings.json'));

    process.env['O1CODE_HOME'] = '/tmp/o1-code-lazy-test';
    expect(getUserSettingsPath()).toBe(
      path.join('/tmp/o1-code-lazy-test', 'settings.json'),
    );
  });

  it('getUserSettingsDir() reflects O1CODE_HOME set after module load', () => {
    expect(getUserSettingsDir()).toBe(path.join(homedir(), '.o1-code'));

    process.env['O1CODE_HOME'] = '/tmp/o1-code-lazy-test';
    expect(getUserSettingsDir()).toBe(path.normalize('/tmp/o1-code-lazy-test'));
  });

  it('getTrustedFoldersPath() reflects O1CODE_HOME set after module load', () => {
    expect(getTrustedFoldersPath()).toBe(
      path.join(homedir(), '.o1-code', 'trustedFolders.json'),
    );

    process.env['O1CODE_HOME'] = '/tmp/o1-code-lazy-test';
    expect(getTrustedFoldersPath()).toBe(
      path.join('/tmp/o1-code-lazy-test', 'trustedFolders.json'),
    );
  });
});
