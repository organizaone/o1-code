/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import * as path from 'node:path';

// Keep this literal in sync with core's O1CODE_DIR. This lite module must not
// import @organizaone/o1-code-core because it runs before serve listener ready.
export const SETTINGS_DIRECTORY_NAME = '.o1-code';

export function resolveConfigPathLite(dir: string, cwd?: string): string {
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
    resolved = path.resolve(cwd || process.cwd(), resolved);
  }
  return resolved;
}

export function getGlobalO1CodeDirLite(): string {
  const envDir = process.env['O1CODE_HOME'];
  if (envDir) {
    return resolveConfigPathLite(envDir);
  }
  const homeDir = os.homedir();
  if (!homeDir) {
    return path.join(os.tmpdir(), SETTINGS_DIRECTORY_NAME);
  }
  return path.join(homeDir, SETTINGS_DIRECTORY_NAME);
}

export function getSystemSettingsPath(): string {
  if (process.env['O1CODE_SYSTEM_SETTINGS_PATH']) {
    return process.env['O1CODE_SYSTEM_SETTINGS_PATH'];
  }
  if (os.platform() === 'darwin') {
    return '/Library/Application Support/O1Code/settings.json';
  }
  if (os.platform() === 'win32') {
    return 'C:\\ProgramData\\o1-code\\settings.json';
  }
  return '/etc/o1-code/settings.json';
}

export function getSystemDefaultsPath(): string {
  if (process.env['O1CODE_SYSTEM_DEFAULTS_PATH']) {
    return process.env['O1CODE_SYSTEM_DEFAULTS_PATH'];
  }
  return path.join(
    path.dirname(getSystemSettingsPath()),
    'system-defaults.json',
  );
}
