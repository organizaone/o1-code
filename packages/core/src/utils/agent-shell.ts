/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import { realpathSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { ShellConfiguration } from './shell-utils.js';

export type AgentShellKind = 'auto' | 'git-bash' | 'powershell' | 'cmd';
export interface AgentShellOptions {
  type?: AgentShellKind;
  executable?: string;
}

function snapshot(
  executable: string,
  shell: ShellConfiguration['shell'],
): ShellConfiguration {
  const argsPrefix =
    shell === 'bash'
      ? ['--noprofile', '--norc', '-c']
      : shell === 'powershell'
        ? ['-NoProfile', '-NonInteractive', '-Command']
        : ['/d', '/s', '/c'];
  return Object.freeze({
    executable,
    shell,
    argsPrefix: Object.freeze(argsPrefix),
  });
}

export function resolveAgentShell(
  options: AgentShellOptions = {},
  environment: {
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    cwd?: string;
  } = { platform: os.platform(), env: process.env },
): ShellConfiguration {
  const type = options.type ?? 'auto';
  if (!['auto', 'git-bash', 'powershell', 'cmd'].includes(type)) {
    throw new Error(`Unsupported agent shell type: ${type}`);
  }
  if (options.executable && type === 'auto') {
    throw new Error(
      'An agent shell executable requires an explicit shell type',
    );
  }
  if (environment.platform !== 'win32') {
    if (type !== 'auto' || options.executable) {
      throw new Error(
        'Explicit agent shell selection is supported only on Windows',
      );
    }
    return Object.freeze({
      executable: 'bash',
      argsPrefix: Object.freeze(['-c']),
      shell: 'bash',
    });
  }
  const win = path.win32;
  const env = (key: string) =>
    Object.entries(environment.env).find(
      ([name]) => name.toLowerCase() === key.toLowerCase(),
    )?.[1];
  const systemRoot = env('SystemRoot') || 'C:\\Windows';
  const profile = env('USERPROFILE');
  let canonicalWorkspace: string | undefined;
  try {
    const resolved = realpathSync(environment.cwd ?? process.cwd());
    if (win.isAbsolute(resolved)) canonicalWorkspace = resolved;
  } catch {
    // Discovery must not execute candidates when the workspace boundary is unknown.
  }
  const inWorkspace = (file: string) => {
    if (!canonicalWorkspace) return true;
    const relative = win.relative(
      canonicalWorkspace.toLowerCase(),
      file.toLowerCase(),
    );
    return (
      relative === '' ||
      (!relative.startsWith('..\\') &&
        relative !== '..' &&
        !win.isAbsolute(relative))
    );
  };
  const paths = (env('PATH') || '')
    .split(';')
    .map((entry) => entry.replace(/^"|"$/g, ''))
    .filter((entry) => win.isAbsolute(entry));
  const isWsl = (file: string) =>
    file
      .toLowerCase()
      .startsWith(`${win.join(systemRoot, 'System32').toLowerCase()}\\`) ||
    file
      .toLowerCase()
      .startsWith(`${win.join(systemRoot, 'Sysnative').toLowerCase()}\\`);
  const localAppData =
    env('LOCALAPPDATA') ||
    (profile ? win.join(profile, 'AppData', 'Local') : undefined);
  const storeAlias = localAppData
    ? win.join(localAppData, 'Microsoft', 'WindowsApps', 'pwsh.exe')
    : undefined;
  let storeAliasDenied = false;
  const usable = (
    file: string,
    shell: 'bash' | 'powershell' | 'cmd',
  ): string | undefined => {
    if (!win.isAbsolute(file) || (shell === 'bash' && isWsl(file)))
      return undefined;
    try {
      const canonical = realpathSync(file);
      if (
        !statSync(canonical).isFile() ||
        (shell === 'bash' && isWsl(canonical)) ||
        (file !== options.executable && inWorkspace(canonical))
      )
        return undefined;
      const output = execFileSync(
        canonical,
        shell === 'bash'
          ? ['--version']
          : shell === 'cmd'
            ? ['/d', '/s', '/c', 'echo O1_CODE_CMD_PROBE']
            : [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                '$PSVersionTable.PSVersion.ToString()',
              ],
        {
          encoding: 'utf8',
          timeout: shell === 'powershell' ? 10000 : 2000,
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 64 * 1024,
        },
      );
      if (
        shell === 'bash'
          ? !/GNU bash/i.test(output)
          : shell === 'cmd'
            ? output.trim() !== 'O1_CODE_CMD_PROBE'
            : !/^\d+\.\d+/m.test(output)
      )
        return undefined;
      return canonical;
    } catch (error) {
      if (
        shell === 'powershell' &&
        file.toLowerCase() === storeAlias?.toLowerCase() &&
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EACCES' || error.code === 'EPERM')
      )
        storeAliasDenied = true;
      return undefined;
    }
  };
  const legacyPowerShell = win.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const discoverStorePowerShell = (host: string): string | undefined => {
    if (!storeAliasDenied || !storeAlias) return undefined;
    try {
      if (
        !options.executable &&
        (inWorkspace(storeAlias) ||
          inWorkspace(realpathSync(win.dirname(storeAlias))))
      )
        return undefined;
      const modules = realpathSync(win.join(win.dirname(host), 'Modules'));
      const manifest = realpathSync(win.join(modules, 'Appx', 'Appx.psd1'));
      if (
        !win.isAbsolute(modules) ||
        win.relative(modules.toLowerCase(), manifest.toLowerCase()) !==
          'appx\\appx.psd1' ||
        inWorkspace(modules) ||
        inWorkspace(manifest) ||
        !statSync(manifest).isFile()
      )
        return undefined;
      const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
      // Restrict dependency loading as well as the Appx import to OS modules.
      const locations = execFileSync(
        host,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$env:PSModulePath = ${literal(modules)}; Import-Module -Name ${literal(manifest)} -ErrorAction Stop; (Appx\\Get-AppxPackage -Name Microsoft.PowerShell -ErrorAction Stop).InstallLocation`,
        ],
        {
          encoding: 'utf8',
          timeout: 10000,
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 64 * 1024,
        },
      );
      for (const location of locations.split(/\r?\n/)) {
        if (!win.isAbsolute(location.trim())) continue;
        const executable = usable(
          win.join(location.trim(), 'pwsh.exe'),
          'powershell',
        );
        if (executable) return executable;
      }
    } catch {
      // Package metadata is optional; retain the validated legacy fallback.
    }
    return undefined;
  };
  if (options.executable) {
    if (!win.isAbsolute(options.executable))
      throw new Error('The agent shell executable must be an absolute path');
    const shell =
      type === 'git-bash'
        ? 'bash'
        : type === 'powershell'
          ? 'powershell'
          : 'cmd';
    let executable = usable(options.executable, shell);
    if (!executable && shell === 'powershell' && storeAliasDenied) {
      const host = usable(legacyPowerShell, 'powershell');
      if (host) executable = discoverStorePowerShell(host);
    }
    if (executable) return snapshot(executable, shell);
    throw new Error(
      `Selected agent shell is unavailable: ${options.executable}`,
    );
  }
  if (type === 'auto' || type === 'git-bash') {
    const roots = [
      ...paths.flatMap((directory) => {
        try {
          const git = realpathSync(win.join(directory, 'git.exe'));
          if (!statSync(git).isFile() || inWorkspace(git)) return [];
          const bin = win.dirname(git);
          const root = /\\(?:cmd|bin)$/i.test(bin) ? win.dirname(bin) : bin;
          return /\\(?:usr|mingw32|mingw64)$/i.test(root)
            ? [win.dirname(root), root]
            : [root];
        } catch {
          return [];
        }
      }),
      env('ProgramFiles')
        ? win.join(env('ProgramFiles')!, 'Git')
        : 'C:\\Program Files\\Git',
      env('ProgramFiles(x86)')
        ? win.join(env('ProgramFiles(x86)')!, 'Git')
        : 'C:\\Program Files (x86)\\Git',
      ...(profile
        ? [
            win.join(profile, 'AppData', 'Local', 'Programs', 'Git'),
            win.join(profile, 'scoop', 'apps', 'git', 'current'),
          ]
        : []),
      ...(env('SCOOP')
        ? [win.join(env('SCOOP')!, 'apps', 'git', 'current')]
        : []),
      ...(env('SCOOP_GLOBAL')
        ? [win.join(env('SCOOP_GLOBAL')!, 'apps', 'git', 'current')]
        : []),
    ];
    for (const root of new Set(roots)) {
      for (const file of [
        win.join(root, 'bin', 'bash.exe'),
        win.join(root, 'usr', 'bin', 'bash.exe'),
      ]) {
        const executable = usable(file, 'bash');
        if (executable) return snapshot(executable, 'bash');
      }
    }
    if (type === 'git-bash')
      throw new Error('Selected Git Bash shell is unavailable');
  }
  if (type === 'powershell') {
    const candidates = [
      ...paths.map((dir) => win.join(dir, 'pwsh.exe')),
      win.join(
        env('ProgramFiles') || 'C:\\Program Files',
        'PowerShell',
        '7',
        'pwsh.exe',
      ),
    ];
    for (const file of new Set(candidates)) {
      const executable = usable(file, 'powershell');
      if (executable) return snapshot(executable, 'powershell');
    }
    const host = usable(legacyPowerShell, 'powershell');
    if (host) {
      const executable = discoverStorePowerShell(host) || host;
      return snapshot(executable, 'powershell');
    }
    throw new Error('Selected PowerShell shell is unavailable');
  }
  return snapshot(win.join(systemRoot, 'System32', 'cmd.exe'), 'cmd');
}
