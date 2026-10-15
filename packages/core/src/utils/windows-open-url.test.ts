/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openWindowsUrl } from './windows-open-url.js';

const native = vi.hoisted(() => ({
  execute: vi.fn(),
  load: vi.fn(),
  func: vi.fn(),
}));
vi.mock('koffi', () => ({ default: { load: native.load } }));

describe('openWindowsUrl', () => {
  beforeEach(() => {
    native.load.mockReturnValue({ func: native.func });
    native.func.mockReturnValue(native.execute);
    native.execute.mockReturnValue(33);
  });
  it('passes metacharacters as unmodified UTF-16 data', async () => {
    const url = "https://example.com/?q=ação%25&name=O'Brien#$(calc)";
    await openWindowsUrl(url);
    expect(native.execute).toHaveBeenCalledWith(
      null,
      'open',
      url,
      null,
      null,
      1,
    );
    expect(native.func).toHaveBeenCalledWith(
      '__stdcall',
      'ShellExecuteW',
      'intptr_t',
      ['void *', 'str16', 'str16', 'str16', 'str16', 'int'],
    );
  });
  it.each([0, 2, 5, 31, 32])(
    'rejects unsuccessful ShellExecute result %d',
    async (result) => {
      native.execute.mockReturnValue(result);
      await expect(openWindowsUrl('https://example.com')).rejects.toThrow(
        'ShellExecuteW failed',
      );
    },
  );
});
