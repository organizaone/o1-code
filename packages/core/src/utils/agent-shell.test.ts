/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { resolveAgentShell } from './agent-shell.js';

const native = vi.hoisted(() => ({
  files: new Set<string>(),
  probe: vi.fn(),
  realpath: vi.fn<(file: string) => string>(),
}));
vi.mock('node:fs', () => ({
  statSync: (file: string) => {
    if (!native.files.has(file.toLowerCase())) throw new Error('ENOENT');
    return { isFile: () => true };
  },
  realpathSync: native.realpath,
}));
vi.mock('node:child_process', () => ({ execFileSync: native.probe }));
const env = { SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\operator' };
const windows = (extra = {}) => ({
  platform: 'win32' as const,
  env: { ...env, ...extra },
  cwd: 'D:\\workspace',
});
function install(file: string) {
  native.files.add(file.toLowerCase());
}
beforeEach(() => {
  native.files.clear();
  native.realpath.mockReset().mockImplementation((file) => file);
  native.probe.mockReset().mockReturnValue('GNU bash, version 5.2');
});
describe('agent shell discovery', () => {
  it('finds Scoop Git without modifying the environment', () => {
    const bash =
      'C:\\Users\\operator\\scoop\\apps\\git\\current\\bin\\bash.exe';
    install(bash);
    const environment = windows();
    const before = { ...environment.env };
    const shell = resolveAgentShell({}, environment);
    expect(shell).toEqual({
      executable: bash,
      argsPrefix: ['--noprofile', '--norc', '-c'],
      shell: 'bash',
    });
    expect(environment.env).toEqual(before);
    expect(Object.isFrozen(shell)).toBe(true);
    expect(Object.isFrozen(shell.argsPrefix)).toBe(true);
    expect(native.probe).toHaveBeenCalledWith(
      bash,
      ['--version'],
      expect.objectContaining({ timeout: 2000, shell: false }),
    );
  });
  it.each([
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Users\\operator\\AppData\\Local\\Programs\\Git\\bin\\bash.exe',
  ])('finds a conventional install at %s', (bash) => {
    install(bash);
    expect(resolveAgentShell({}, windows()).executable).toBe(bash);
  });
  it('checks case insensitive PATH and Git cmd siblings', () => {
    const bash = 'D:\\Portable Git\\bin\\bash.exe';
    install(bash);
    install('D:\\Portable Git\\cmd\\git.exe');
    expect(
      resolveAgentShell({}, windows({ Path: 'D:\\Portable Git\\cmd' }))
        .executable,
    ).toBe(bash);
  });
  it('does not probe WSL bash, relative paths or the current directory', () => {
    install('C:\\Windows\\System32\\bash.exe');
    install('relative\\bash.exe');
    expect(
      resolveAgentShell(
        {},
        windows({ PATH: ';relative;C:\\Windows\\System32' }),
      ),
    ).toEqual({
      executable: 'C:\\Windows\\System32\\cmd.exe',
      argsPrefix: ['/d', '/s', '/c'],
      shell: 'cmd',
    });
    expect(native.probe).not.toHaveBeenCalled();
  });
  it('does not execute a repository-planted Git from PATH', () => {
    install('D:\\project\\Git\\bin\\bash.exe');
    expect(
      resolveAgentShell(
        {},
        { ...windows({ PATH: 'D:\\project\\Git\\bin' }), cwd: 'D:\\project' },
      ).shell,
    ).toBe('cmd');
    expect(native.probe).not.toHaveBeenCalled();
  });

  it('excludes repository executables through a workspace junction', () => {
    install('D:\\repository\\Git\\bin\\bash.exe');
    install('D:\\repository\\Git\\cmd\\git.exe');
    native.realpath.mockImplementation((file) =>
      file.replace('D:\\alias', 'D:\\repository'),
    );
    expect(
      resolveAgentShell(
        {},
        { ...windows({ PATH: 'D:\\alias\\Git\\cmd' }), cwd: 'D:\\alias' },
      ).shell,
    ).toBe('cmd');
    expect(native.probe).not.toHaveBeenCalled();
  });
  it('does not discover executables when the workspace boundary is unavailable', () => {
    install('C:\\Program Files\\Git\\bin\\bash.exe');
    native.realpath.mockImplementation((file) => {
      if (file === 'D:\\workspace') throw new Error('denied');
      return file;
    });
    expect(resolveAgentShell({}, windows()).shell).toBe('cmd');
    expect(native.probe).not.toHaveBeenCalled();
  });
  it('finds a renamed Git installation from its executable in PATH', () => {
    install('D:\\Tools\\cmd\\git.exe');
    install('D:\\Tools\\bin\\bash.exe');
    expect(
      resolveAgentShell({}, windows({ PATH: 'D:\\Tools\\cmd' })).executable,
    ).toBe('D:\\Tools\\bin\\bash.exe');
  });
  it('rejects a PowerShell executable selected with CMD semantics', () => {
    const executable =
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    install(executable);
    native.probe.mockReturnValue('5.1.19041');
    expect(() =>
      resolveAgentShell({ type: 'cmd', executable }, windows()),
    ).toThrow(/unavailable/i);
  });
  it('accepts CMD only after a bounded fixed compatibility probe', () => {
    const executable = 'C:\\Windows\\System32\\cmd.exe';
    install(executable);
    native.probe.mockReturnValue('O1_CODE_CMD_PROBE\r\n');
    expect(
      resolveAgentShell({ type: 'cmd', executable }, windows()).shell,
    ).toBe('cmd');
    expect(native.probe).toHaveBeenCalledWith(
      executable,
      ['/d', '/s', '/c', 'echo O1_CODE_CMD_PROBE'],
      expect.objectContaining({ timeout: 2000, shell: false }),
    );
  });
  it('rejects unavailable and nonabsolute explicit selections', () => {
    expect(() => resolveAgentShell({ type: 'git-bash' }, windows())).toThrow(
      /unavailable/i,
    );
    expect(() =>
      resolveAgentShell(
        { type: 'git-bash', executable: 'bash.exe' },
        windows(),
      ),
    ).toThrow(/absolute/i);
    expect(() =>
      resolveAgentShell({ executable: 'C:\\bash.exe' }, windows()),
    ).toThrow(/explicit/i);
  });
  it('skips a broken PowerShell 7 alias and selects Windows PowerShell', () => {
    const alias =
      'C:\\Users\\operator\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe';
    const legacy =
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    install(alias);
    install(legacy);
    native.probe.mockImplementation((file: string) => {
      if (file === alias) throw new Error('alias unavailable');
      return '5.1.19041';
    });
    expect(
      resolveAgentShell(
        { type: 'powershell' },
        windows({ PATH: path.win32.dirname(alias) }),
      ),
    ).toEqual({
      executable: legacy,
      argsPrefix: ['-NoProfile', '-NonInteractive', '-Command'],
      shell: 'powershell',
    });
  });
  it('allows bounded PowerShell startup on slower Windows hosts', () => {
    const executable =
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    install(executable);
    native.probe.mockReturnValue('5.1.19041');
    resolveAgentShell({ type: 'powershell', executable }, windows());
    expect(native.probe).toHaveBeenCalledWith(
      executable,
      expect.any(Array),
      expect.objectContaining({ timeout: 10000, shell: false }),
    );
  });
  it('preserves automatic Unix behavior and rejects Windows selections there', () => {
    expect(resolveAgentShell({}, { platform: 'darwin', env: {} })).toEqual({
      executable: 'bash',
      argsPrefix: ['-c'],
      shell: 'bash',
    });
    expect(() =>
      resolveAgentShell({ type: 'cmd' }, { platform: 'darwin', env: {} }),
    ).toThrow(/Windows/);
  });
});
