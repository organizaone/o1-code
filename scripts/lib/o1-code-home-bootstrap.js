/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';

/**
 * Expands tilde and resolves relative paths to absolute. Mirrors
 * `Storage.resolvePath` in packages/core (kept in sync — these scripts run
 * before the core bundle is built and cannot import from it).
 */
export function resolvePath(dir) {
  let resolved = dir;
  if (
    resolved === '~' ||
    resolved.startsWith('~/') ||
    resolved.startsWith('~\\')
  ) {
    const segments =
      resolved === '~'
        ? []
        : resolved
            .slice(2)
            .split(/[/\\]+/)
            .filter(Boolean);
    resolved = path.join(os.homedir(), ...segments);
  }
  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(resolved);
  }
  return resolved;
}

/**
 * Pre-resolves O1CODE_HOME / O1CODE_RUNTIME_DIR from home-scoped `.env` files so
 * that helper scripts (sandbox launcher, telemetry) agree with the main CLI's
 * `preResolveHomeEnvOverrides`. Without this, the CLI may route to a custom
 * config dir via `~/.env` while these scripts still read `~/.o1-code/...`,
 * splitting global state across two locations.
 *
 * Project `.env` files are deliberately excluded — only home-scoped files are
 * consulted so a project repo can never redirect global state through this
 * back door (consistent with `PROJECT_ENV_HARDCODED_EXCLUSIONS` in the CLI).
 *
 * Idempotent: safe to call from multiple scripts in the same process.
 */
export function bootstrapHomeEnv() {
  if (process.env.O1CODE_HOME && process.env.O1CODE_RUNTIME_DIR) {
    return;
  }
  const initialO1CodeHome = process.env.O1CODE_HOME;
  const initialO1CodeDir = initialO1CodeHome
    ? resolvePath(initialO1CodeHome)
    : path.join(os.homedir(), '.o1-code');
  const candidates = [path.join(initialO1CodeDir, '.env')];
  if (!initialO1CodeHome) {
    candidates.push(path.join(os.homedir(), '.env'));
  }
  for (const candidate of candidates) {
    readEnvInto(candidate);
  }

  // If O1CODE_HOME was just discovered, also read <new O1CODE_HOME>/.env so
  // O1CODE_RUNTIME_DIR can be sourced from there (mirrors the VS Code
  // companion's bootstrapHomeEnvOverrides).
  const discoveredO1CodeHome = process.env.O1CODE_HOME;
  if (discoveredO1CodeHome && discoveredO1CodeHome !== initialO1CodeHome) {
    const discoveredDir = resolvePath(discoveredO1CodeHome);
    if (discoveredDir !== initialO1CodeDir) {
      readEnvInto(path.join(discoveredDir, '.env'));
    }
  }
}

function readEnvInto(file) {
  if (!existsSync(file)) {
    return;
  }
  try {
    const parsed = dotenv.parse(readFileSync(file, 'utf-8'));
    for (const key of ['O1CODE_HOME', 'O1CODE_RUNTIME_DIR']) {
      if (parsed[key] && !Object.hasOwn(process.env, key)) {
        process.env[key] = parsed[key];
      }
    }
  } catch {
    // Match dotenv's quiet-mode behavior used elsewhere.
  }
}
