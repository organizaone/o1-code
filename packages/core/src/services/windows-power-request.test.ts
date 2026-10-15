/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: vi.fn(() => 'win32'),
  create: vi.fn((): bigint | null => 42n),
  set: vi.fn(() => 1),
  clear: vi.fn(() => 1),
  close: vi.fn(() => 1),
  error: vi.fn(() => 5),
  load: vi.fn(),
}));

vi.mock('node:os', () => ({ platform: native.platform }));
vi.mock('koffi', () => ({
  default: {
    struct: vi.fn(() => ({})),
    union: vi.fn(() => ({})),
    pointer: vi.fn(() => ({})),
    address: (handle: bigint) => handle,
    sizeof: () => 8,
    load: native.load,
  },
}));

async function acquire(reason = 'working') {
  const { acquireWindowsPowerRequest } = await import(
    './windows-power-request.js'
  );
  return acquireWindowsPowerRequest(reason);
}

describe('Windows power requests', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    native.platform.mockReturnValue('win32');
    native.create.mockReturnValue(42n);
    native.set.mockReturnValue(1);
    native.clear.mockReturnValue(1);
    native.close.mockReturnValue(1);
    native.load.mockReturnValue({
      func: (_convention: string, name: string) => {
        const functions: Record<string, unknown> = {
          PowerCreateRequest: native.create,
          PowerSetRequest: native.set,
          PowerClearRequest: native.clear,
          CloseHandle: native.close,
          GetLastError: native.error,
        };
        if (!(name in functions))
          throw new Error(`Unexpected native function: ${name}`);
        return functions[name];
      },
    });
    vi.stubEnv('SystemRoot', 'C:\\Windows');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('releases only system sleep prevention and closes the handle once', async () => {
    const request = await acquire('run\nwithout\0secrets');
    expect(native.set).toHaveBeenCalledWith(42n, 1);
    expect(native.create).toHaveBeenCalledWith({
      Version: 0,
      Flags: 1,
      Reason: { SimpleReasonString: 'run without secrets' },
    });
    expect(native.load).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\kernel32.dll',
    );
    request.release();
    request.release();
    expect(native.clear).toHaveBeenCalledExactlyOnceWith(42n, 1);
    expect(native.close).toHaveBeenCalledExactlyOnceWith(42n);
  });

  it('closes the handle when setting the request fails', async () => {
    native.set.mockReturnValue(0);
    await expect(acquire()).rejects.toThrow(
      'PowerSetRequest failed (Windows error 5)',
    );
    expect(native.close).toHaveBeenCalledExactlyOnceWith(42n);
    expect(native.clear).not.toHaveBeenCalled();
  });

  it.each([null, 0n, -1n, 0xffffffffffffffffn])(
    'rejects invalid handle %s',
    async (handle) => {
      native.create.mockReturnValue(handle);
      await expect(acquire()).rejects.toThrow('PowerCreateRequest failed');
      expect(native.set).not.toHaveBeenCalled();
      expect(native.close).not.toHaveBeenCalled();
    },
  );

  it('closes the handle even when clearing the request fails', async () => {
    const request = await acquire();
    native.clear.mockReturnValue(0);
    expect(() => request.release()).toThrow('PowerClearRequest failed');
    request.release();
    expect(native.close).toHaveBeenCalledExactlyOnceWith(42n);
  });

  it('does not load a native library on another platform', async () => {
    native.platform.mockReturnValue('darwin');
    await expect(acquire()).rejects.toThrow(
      'Windows power requests are unavailable',
    );
    expect(native.load).not.toHaveBeenCalled();
  });
});
