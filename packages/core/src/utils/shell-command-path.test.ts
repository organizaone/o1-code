/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync } from 'node:fs';
import { resolveCommandPath } from './shell-utils.js';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  accessSync: vi.fn(),
}));

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  vi.resetAllMocks();
});

describe('command lookup terminal isolation', () => {
  it.each(['win32', 'linux'])(
    'captures missing-command diagnostics on %s without writing over the TUI',
    (value) => {
      Object.defineProperty(process, 'platform', { value });
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('command not found');
      });

      expect(resolveCommandPath('missing-command')).toEqual({
        path: null,
        error: undefined,
      });
      expect(execFileSync).toHaveBeenCalledWith(
        value === 'win32' ? 'where.exe' : '/bin/sh',
        value === 'win32'
          ? ['missing-command']
          : ['-c', 'command -v missing-command'],
        expect.objectContaining({ stdio: 'pipe', windowsHide: true }),
      );
    },
  );

  it.each(['win32', 'linux'])(
    'returns a discovered command on %s with the same isolated lookup',
    (value) => {
      Object.defineProperty(process, 'platform', { value });
      vi.mocked(execFileSync).mockReturnValue(' /example/rg \r\n');

      expect(resolveCommandPath('rg')).toEqual({ path: '/example/rg' });
      if (value !== 'win32') expect(accessSync).toHaveBeenCalled();
      expect(execFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ stdio: 'pipe', windowsHide: true }),
      );
    },
  );
});
