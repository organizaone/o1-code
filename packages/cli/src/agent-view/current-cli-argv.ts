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

export function buildFreshO1CodeWorkerLaunch(args: readonly string[]): {
  argv: string[];
  entrypoint: string;
  env: Record<string, string>;
} {
  const bootstrap = process.env['O1CODE_CLI'];
  if (
    process.env['DEV'] !== 'true' &&
    bootstrap &&
    path.isAbsolute(bootstrap) &&
    bootstrap.endsWith('.js')
  ) {
    try {
      if (fs.statSync(bootstrap).isFile()) {
        const entrypoint = fs.realpathSync(bootstrap);
        return {
          argv: [process.execPath, entrypoint, ...args],
          entrypoint,
          // Launch env overrides the old supervisor's session pin. Existing
          // bootstraps treat empty values as absent and select the active update.
          env: {
            CLI_VERSION: '',
            O1CODE_STARTUP_VERSION: '',
            O1CODE_MANAGED_NPM_PIN: '',
          },
        };
      }
    } catch {
      // A missing or inaccessible bootstrap cannot replace a working entrypoint.
    }
  }
  return {
    argv: buildCurrentO1CodeCliArgv(args),
    entrypoint: getCurrentO1CodeCliEntrypoint(),
    env: {},
  };
}

function findLocalTsxCli(entrypoint: string): string | undefined {
  const root = path.resolve(path.dirname(entrypoint), '..', '..');
  const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fs.existsSync(tsxCli)) {
    return tsxCli;
  }
  return undefined;
}
