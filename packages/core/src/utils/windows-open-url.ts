/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';

type ShellExecute = (
  parent: null,
  operation: string,
  file: string,
  parameters: null,
  directory: null,
  show: number,
) => number | bigint;

let executePromise: Promise<ShellExecute> | undefined;

/** The caller validates web URLs and explicitly allowlists local reports. */
export async function openWindowsUrl(url: string): Promise<void> {
  executePromise ??= import('koffi').then(({ default: koffi }) => {
    const shell = koffi.load(
      path.win32.join(
        process.env['SystemRoot'] || 'C:\\Windows',
        'System32',
        'shell32.dll',
      ),
    );
    return shell.func('__stdcall', 'ShellExecuteW', 'intptr_t', [
      'void *',
      'str16',
      'str16',
      'str16',
      'str16',
      'int',
    ]) as ShellExecute;
  });
  const execute = await executePromise;
  const result = execute(null, 'open', url, null, null, 1);
  if (BigInt(result) <= 32n) {
    throw new Error(`ShellExecuteW failed (Windows result ${result})`);
  }
}
