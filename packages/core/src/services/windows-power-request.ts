/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform } from 'node:os';
import path from 'node:path';

export interface WindowsPowerRequest {
  release(): void;
}

interface PowerRequestContext {
  Version: number;
  Flags: number;
  Reason: { SimpleReasonString: string };
}

interface WindowsPowerApi {
  create(context: PowerRequestContext): unknown;
  set(handle: unknown, type: number): number;
  clear(handle: unknown, type: number): number;
  close(handle: unknown): number;
  error(): number;
  invalid(handle: unknown): boolean;
}

let apiPromise: Promise<WindowsPowerApi> | undefined;

function loadPowerApi(): Promise<WindowsPowerApi> {
  apiPromise ??= import('koffi').then(({ default: koffi }) => {
    const detailed = koffi.struct({
      module: 'void *',
      id: 'uint32',
      count: 'uint32',
      strings: 'void *',
    });
    const reason = koffi.union({
      SimpleReasonString: 'str16',
      Detailed: detailed,
    });
    const context = koffi.struct({
      Version: 'uint32',
      Flags: 'uint32',
      Reason: reason,
    });
    const kernel = koffi.load(
      path.win32.join(
        process.env['SystemRoot'] || 'C:\\Windows',
        'System32',
        'kernel32.dll',
      ),
    );
    // The full union keeps REASON_CONTEXT's ABI layout correct on both Windows architectures.
    const create = kernel.func('__stdcall', 'PowerCreateRequest', 'void *', [
      koffi.pointer(context),
    ]) as WindowsPowerApi['create'];
    const set = kernel.func('__stdcall', 'PowerSetRequest', 'int', [
      'void *',
      'int',
    ]) as WindowsPowerApi['set'];
    const clear = kernel.func('__stdcall', 'PowerClearRequest', 'int', [
      'void *',
      'int',
    ]) as WindowsPowerApi['clear'];
    const close = kernel.func('__stdcall', 'CloseHandle', 'int', [
      'void *',
    ]) as WindowsPowerApi['close'];
    const error = kernel.func(
      '__stdcall',
      'GetLastError',
      'uint32',
      [],
    ) as WindowsPowerApi['error'];
    const invalidAddress = (1n << BigInt(koffi.sizeof('void *') * 8)) - 1n;
    return {
      create,
      set,
      clear,
      close,
      error,
      invalid(handle: unknown) {
        if (handle === null || handle === undefined) return true;
        const address = koffi.address(handle);
        return address === 0n || address === -1n || address === invalidAddress;
      },
    };
  });
  return apiPromise;
}

export async function acquireWindowsPowerRequest(
  reason: string,
): Promise<WindowsPowerRequest> {
  if (platform() !== 'win32') {
    throw new Error('Windows power requests are unavailable on this platform');
  }
  const api = await loadPowerApi();
  const failure = (operation: string) =>
    new Error(`${operation} failed (Windows error ${api.error()})`);
  // The reason is visible to other local processes through Windows power diagnostics.
  // eslint-disable-next-line no-control-regex
  const controlCharacters = /[\x00-\x1f\x7f]/g;
  const safeReason = reason
    .replace(controlCharacters, ' ')
    .slice(0, 120)
    .trim();
  const handle = api.create({
    Version: 0,
    Flags: 1,
    Reason: {
      SimpleReasonString: safeReason,
    },
  });
  if (api.invalid(handle)) throw failure('PowerCreateRequest');
  try {
    if (api.set(handle, 1) === 0) throw failure('PowerSetRequest');
  } catch (error) {
    api.close(handle);
    throw error;
  }
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      let clearError: Error | undefined;
      try {
        if (api.clear(handle, 1) === 0)
          clearError = failure('PowerClearRequest');
      } finally {
        if (api.close(handle) === 0 && !clearError) {
          clearError = failure('CloseHandle');
        }
      }
      if (clearError) throw clearError;
    },
  };
}
