/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

type TerminalEnvironment = Record<string, string | undefined>;

export function isCiEnvKey(key: string): boolean {
  return (
    key === 'CI' || key === 'CONTINUOUS_INTEGRATION' || key.startsWith('CI_')
  );
}

function isActiveCiValue(value: string | undefined): boolean {
  const normalizedValue = value?.toLowerCase();
  return (
    value !== undefined &&
    value !== '' &&
    normalizedValue !== '0' &&
    normalizedValue !== 'false'
  );
}

function isCiEnvironment(env: TerminalEnvironment): boolean {
  return Object.keys(env).some(
    (key) => isCiEnvKey(key) && isActiveCiValue(env[key]),
  );
}

export function isInteractiveTerminal(
  stdoutIsTTY: boolean | undefined = process.stdout.isTTY,
  env: TerminalEnvironment = process.env,
): boolean {
  return (
    Boolean(stdoutIsTTY) &&
    !isCiEnvironment(env) &&
    env['TERM']?.toLowerCase() !== 'dumb'
  );
}

export function shouldUseVirtualViewport(
  useTerminalBuffer: boolean | undefined,
  screenReader: boolean,
  terminalInteractive: boolean,
): boolean {
  // The settings loader does not apply schema defaults, so keep this fallback
  // in sync with settingsSchema.ts's default for ui.useTerminalBuffer.
  return terminalInteractive && (useTerminalBuffer ?? true) && !screenReader;
}

/**
 * Whether Ink rewrites only the lines that changed between frames instead of
 * erasing and redrawing the whole output. `O1CODE_INCREMENTAL_RENDERING`
 * (`0` or `1`) wins over the setting, so a terminal that loses track of the
 * cursor can be worked around without editing settings.
 */
export function shouldUseIncrementalRendering(
  incrementalRendering: boolean | undefined,
  env: TerminalEnvironment = process.env,
): boolean {
  const override = env['O1CODE_INCREMENTAL_RENDERING'];
  if (override === '0') {
    return false;
  }
  if (override === '1') {
    return true;
  }
  // Same fallback contract as shouldUseVirtualViewport: the loader does not
  // apply schema defaults, so mirror settingsSchema.ts here.
  return incrementalRendering ?? true;
}
