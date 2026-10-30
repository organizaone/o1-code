/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import semver from 'semver';
import {
  DEFAULT_COMMAND_OPTIONS,
  TOP_LEVEL_GLOBAL_OPTIONS,
} from '../config/top-level-options.js';

const execFileAsync = promisify(execFile);
const optionTypes = new Map<string, string>();
for (const [name, definition] of Object.entries({
  ...TOP_LEVEL_GLOBAL_OPTIONS,
  ...DEFAULT_COMMAND_OPTIONS,
})) {
  const alias = 'alias' in definition ? definition.alias : undefined;
  const names = [
    name,
    ...(typeof alias === 'string'
      ? [alias]
      : Array.isArray(alias)
        ? alias
        : []),
  ];
  for (const option of names)
    optionTypes.set(
      `${option.length === 1 ? '-' : '--'}${option}`,
      definition.type,
    );
}

function restartArguments(
  sessionId: string,
  approvalMode?: string,
  resume = true,
): string[] {
  const args = process.argv.slice(2);
  const result: string[] = [];
  const replaced = new Set([
    '--resume',
    '-r',
    '--session-id',
    '--sandbox-session-id',
    '--continue',
    '-c',
    '--prompt',
    '-p',
    '--prompt-interactive',
    '-i',
    '--worktree',
    '--fork-session',
  ]);
  if (approvalMode) {
    for (const flag of ['--approval-mode', '--yolo', '-y']) replaced.add(flag);
  }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--') break;
    if (!arg.startsWith('-')) continue;
    const flag = arg.split('=')[0]!;
    const type = optionTypes.get(flag);
    const booleanValue = args[index + 1];
    if (
      (type === 'boolean' || flag.startsWith('--no-')) &&
      !arg.includes('=') &&
      (booleanValue === 'true' || booleanValue === 'false')
    ) {
      if (!replaced.has(flag)) result.push(arg, booleanValue);
      index++;
      continue;
    }
    const hasValue =
      !arg.includes('=') && type !== 'boolean' && !flag.startsWith('--no-');
    if (!replaced.has(flag)) result.push(arg);
    if (
      hasValue &&
      args[index + 1] !== undefined &&
      !args[index + 1]!.startsWith('-')
    ) {
      do {
        index++;
        if (!replaced.has(flag)) result.push(args[index]!);
      } while (
        type === 'array' &&
        args[index + 1] !== undefined &&
        !args[index + 1]!.startsWith('-')
      );
    }
  }
  if (approvalMode) result.push('--approval-mode', approvalMode);
  return [...result, resume ? '--resume' : '--session-id', sessionId];
}

function restartEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    O1CODE_SKIP_UPDATE_CHECK_ONCE: 'true',
  };
  for (const key of [
    'CLI_VERSION',
    'O1CODE_STARTUP_VERSION',
    'O1CODE_MANAGED_NPM_PIN',
    'O1CODE_RELAUNCH_ARGS',
    'O1CODE_MANAGED_NPM_UPDATE_VERSION',
  ])
    delete env[key];
  return env;
}

function bootstrapPath(): string {
  const bootstrap = process.env['O1CODE_CLI'];
  if (!bootstrap || !bootstrap.endsWith('.js')) {
    throw new Error(
      'Unable to identify the npm launcher for this installation.',
    );
  }
  return bootstrap;
}

export async function verifyUpdatedNpmLauncher(
  targetVersion: string,
): Promise<void> {
  const bootstrap = bootstrapPath();
  const options = {
    env: restartEnvironment(),
    encoding: 'utf8' as const,
    timeout: 15_000,
    windowsHide: true,
  };
  const { stdout } = await execFileAsync(
    process.execPath,
    [bootstrap, '--version'],
    options,
  );
  const actual = stdout.trim();
  if (!semver.valid(actual) || !semver.gte(actual, targetVersion)) {
    throw new Error(
      `The updated launcher still reports ${actual || 'an unknown version'}; expected ${targetVersion}.`,
    );
  }
  await execFileAsync(process.execPath, [bootstrap, '--help'], options);
}

// Invoke the bootstrap directly instead of an old wrapper's PATH relaunch.
export async function relaunchUpdatedNpmApplication(
  sessionId: string,
  approvalMode?: string,
  resume = true,
): Promise<number> {
  // Removing UI listeners does not stop the old Windows console reader.
  process.stdin.pause();
  try {
    const child = spawn(
      process.execPath,
      [bootstrapPath(), ...restartArguments(sessionId, approvalMode, resume)],
      {
        stdio: 'inherit',
        env: restartEnvironment(),
        windowsHide: true,
      },
    );
    return await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? 1));
    });
  } finally {
    process.stdin.resume();
  }
}
