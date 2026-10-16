/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { canUseRipgrep } from '@organizaone/o1-code-core/utils/ripgrepUtils.js';
import { getUserStartupWarnings } from './userStartupWarnings.js';
import * as os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

vi.mock('@organizaone/o1-code-core/utils/ripgrepUtils.js', () => ({
  canUseRipgrep: vi.fn(),
}));
const { diagnosticWarn } = vi.hoisted(() => ({ diagnosticWarn: vi.fn() }));
vi.mock('@organizaone/o1-code-core/utils/debugLogger.js', () => ({
  createDebugLogger: vi.fn(() => ({ warn: diagnosticWarn })),
}));

describe('getUserStartupWarnings', () => {
  let testRootDir: string;
  let startupOptions: {
    workspaceRoot: string;
    useRipgrep: boolean;
    useBuiltinRipgrep: boolean;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(canUseRipgrep).mockResolvedValue(true);
    testRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'warnings-test-'));
    startupOptions = {
      workspaceRoot: testRootDir,
      useRipgrep: true,
      useBuiltinRipgrep: true,
    };
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  describe('root directory check', () => {
    it('should return a warning when running in a root directory', async () => {
      const rootDir = path.parse(testRootDir).root;
      const warnings = await getUserStartupWarnings({
        ...startupOptions,
        workspaceRoot: rootDir,
      });
      expect(warnings).toContainEqual(
        expect.stringContaining('root directory'),
      );
      expect(warnings).toContainEqual(
        expect.stringContaining('folder structure will be used'),
      );
    });

    it('should not return a warning when running in a non-root directory', async () => {
      const projectDir = path.join(testRootDir, 'project');
      await fs.mkdir(projectDir);
      const warnings = await getUserStartupWarnings({
        ...startupOptions,
        workspaceRoot: projectDir,
      });
      expect(warnings).not.toContainEqual(
        expect.stringContaining('root directory'),
      );
    });
  });

  describe('error handling', () => {
    it('should handle errors when checking directory', async () => {
      const nonExistentPath = path.join(testRootDir, 'non-existent');
      const warnings = await getUserStartupWarnings({
        ...startupOptions,
        workspaceRoot: nonExistentPath,
      });
      const expectedWarning =
        'Could not verify the current directory due to a file system error.';
      expect(warnings).toEqual([expectedWarning]);
    });
  });

  describe('ripgrep diagnostics', () => {
    it('keeps unavailable acceleration out of startup warnings and logs the fallback', async () => {
      vi.mocked(canUseRipgrep).mockResolvedValue(false);

      expect(await getUserStartupWarnings(startupOptions)).toEqual([]);
      expect(diagnosticWarn).toHaveBeenCalledWith(
        expect.stringContaining('Falling back'),
      );
    });

    it('logs probe errors without showing an ordinary startup warning', async () => {
      vi.mocked(canUseRipgrep).mockRejectedValue(new Error('spawn ENOEXEC'));

      expect(await getUserStartupWarnings(startupOptions)).toEqual([]);
      expect(diagnosticWarn).toHaveBeenCalledWith(
        expect.stringContaining('spawn ENOEXEC'),
      );
    });

    it('does not probe when ripgrep is intentionally disabled', async () => {
      expect(
        await getUserStartupWarnings({ ...startupOptions, useRipgrep: false }),
      ).toEqual([]);
      expect(canUseRipgrep).not.toHaveBeenCalled();
      expect(diagnosticWarn).not.toHaveBeenCalled();
    });

    it('honors system-only selection without showing a fallback warning', async () => {
      vi.mocked(canUseRipgrep).mockResolvedValue(false);

      expect(
        await getUserStartupWarnings({
          ...startupOptions,
          useBuiltinRipgrep: false,
        }),
      ).toEqual([]);
      expect(canUseRipgrep).toHaveBeenCalledWith(false);
    });
  });
});
