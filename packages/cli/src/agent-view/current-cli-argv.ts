/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export function getCurrentO1CodeCliEntrypoint(): string {
  const entry = process.argv[1];
  if (!entry) return 'o1-code';
  // Absolute-ize so the persisted argv and the PTY spawn resolve the same
  // binary regardless of the supervisor daemon's cwd.
  return path.isAbsolute(entry) ? entry : path.resolve(entry);
}

export function buildCurrentO1CodeCliArgv(args: readonly string[]): string[] {
  const entrypoint = getCurrentO1CodeCliEntrypoint();
  if (entrypoint === 'o1-code') {
    return ['o1-code', ...args];
  }

  if (process.env['DEV'] === 'true' && entrypoint.endsWith('.ts')) {
    const tsxCli = findLocalTsxCli(entrypoint);
    if (tsxCli) {
      return [process.execPath, tsxCli, entrypoint, ...args];
    }
    throw new Error(
      `Cannot spawn supervisor: DEV=true with TypeScript entrypoint ${entrypoint} but tsx was not found. Run npm install.`,
    );
  }

  return [process.execPath, entrypoint, ...args];
}

function findLocalTsxCli(entrypoint: string): string | undefined {
  const root = path.resolve(path.dirname(entrypoint), '..', '..');
  const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fs.existsSync(tsxCli)) {
    return tsxCli;
  }
  return undefined;
}
