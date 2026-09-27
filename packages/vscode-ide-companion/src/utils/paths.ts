/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

/**
 * Expands tilde and resolves relative paths to absolute.
 * Mirrors Storage.resolvePath() in packages/core.
 */
function resolvePath(dir: string): string {
  let resolved = dir;
  if (
    resolved === '~' ||
    resolved.startsWith('~/') ||
    resolved.startsWith('~\\')
  ) {
    const relativeSegments =
      resolved === '~'
        ? []
        : resolved
            .slice(2)
            .split(/[/\\]+/)
            .filter(Boolean);
    resolved = path.join(os.homedir(), ...relativeSegments);
  }
  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(resolved);
  }
  return resolved;
}

let envBootstrapped = false;

/**
 * Pre-resolves O1CODE_HOME / O1CODE_RUNTIME_DIR from `<homedir>/.o1-code/.env` and
 * `<homedir>/.env`. Mirrors the CLI's `preResolveHomeEnvOverrides` so the
 * companion's lock-file location agrees with the CLI even when these vars
 * are only configured via `.env`. Idempotent.
 */
function bootstrapHomeEnvOverrides(): void {
  if (envBootstrapped) {
    return;
  }
  envBootstrapped = true;

  if (process.env['O1CODE_HOME'] && process.env['O1CODE_RUNTIME_DIR']) {
    return;
  }

  const homeDir = os.homedir();
  if (!homeDir) {
    return;
  }

  const initialO1CodeHome = process.env['O1CODE_HOME'];
  const currentO1CodeDir = initialO1CodeHome
    ? resolvePath(initialO1CodeHome)
    : path.join(homeDir, '.o1-code');

  const KEYS = ['O1CODE_HOME', 'O1CODE_RUNTIME_DIR'] as const;
  const readInto = (file: string) => {
    try {
      const parsed = dotenv.parse(fs.readFileSync(file, 'utf-8'));
      for (const key of KEYS) {
        if (parsed[key] && !Object.hasOwn(process.env, key)) {
          process.env[key] = parsed[key];
        }
      }
    } catch {
      // Match the dotenv quiet-mode behavior used by the CLI.
    }
  };

  readInto(path.join(currentO1CodeDir, '.env'));
  if (!initialO1CodeHome) {
    readInto(path.join(homeDir, '.env'));
  }

  // If O1CODE_HOME was just discovered, also read <new O1CODE_HOME>/.env so
  // O1CODE_RUNTIME_DIR can be sourced from there — otherwise the companion
  // would write lock files into a different runtime dir than the CLI reads.
  const discoveredO1CodeHome = process.env['O1CODE_HOME'];
  if (discoveredO1CodeHome && discoveredO1CodeHome !== initialO1CodeHome) {
    const discoveredDir = resolvePath(discoveredO1CodeHome);
    if (discoveredDir !== currentO1CodeDir) {
      readInto(path.join(discoveredDir, '.env'));
    }
  }
}

/** Test-only: reset the bootstrap latch. */
export function resetEnvBootstrapForTesting(): void {
  envBootstrapped = false;
}

/**
 * Returns the global O1-Code home directory (config, credentials, etc.).
 *
 * Priority: O1CODE_HOME env var > ~/.o1-code
 */
export function getGlobalO1CodeDir(): string {
  bootstrapHomeEnvOverrides();
  const envDir = process.env['O1CODE_HOME'];
  if (envDir) {
    return resolvePath(envDir);
  }
  const homeDir = os.homedir();
  return homeDir
    ? path.join(homeDir, '.o1-code')
    : path.join(os.tmpdir(), '.o1-code');
}

/**
 * Returns the runtime base directory for ephemeral data (tmp, debug, IDE
 * lock files, sessions, etc.).
 *
 * Priority: O1CODE_RUNTIME_DIR env var > O1CODE_HOME env var > ~/.o1-code
 *
 * This mirrors the fallback chain in packages/core Storage.getRuntimeBaseDir()
 * without importing from core to avoid cross-package dependencies.
 */
export function getRuntimeBaseDir(): string {
  bootstrapHomeEnvOverrides();
  const runtimeDir = process.env['O1CODE_RUNTIME_DIR'];
  if (runtimeDir) {
    return resolvePath(runtimeDir);
  }
  return getGlobalO1CodeDir();
}
