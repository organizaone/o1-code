import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { Storage } from '@organizaone/o1-code-core';
import type { LoadedSettings } from '../config/settings.js';
import { runWithAcpRuntimeOutputDir } from './runtimeOutputDirContext.js';

describe('runWithAcpRuntimeOutputDir', () => {
  beforeEach(() => {
    Storage.setRuntimeBaseDir(null);
    delete process.env['O1CODE_RUNTIME_DIR'];
  });

  afterEach(() => {
    Storage.setRuntimeBaseDir(null);
    delete process.env['O1CODE_RUNTIME_DIR'];
  });

  it('uses the merged runtimeOutputDir relative to cwd within the async context', async () => {
    const cwd = path.resolve('workspace', 'project-a');
    const settings = {
      merged: {
        advanced: {
          runtimeOutputDir: '.o1-code-runtime',
        },
      },
    } as LoadedSettings;

    await runWithAcpRuntimeOutputDir(settings, cwd, async () => {
      expect(Storage.getRuntimeBaseDir()).toBe(
        path.join(cwd, '.o1-code-runtime'),
      );
    });

    expect(Storage.getRuntimeBaseDir()).toBe(Storage.getGlobalO1CodeDir());
  });
});
