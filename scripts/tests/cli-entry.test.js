/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const {
  spawnSyncMock,
  existsSyncMock,
  homedirMock,
  tmpdirMock,
  enableCompileCacheMock,
} = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(() => ({ status: 0, signal: null })),
  existsSyncMock: vi.fn(() => false),
  homedirMock: vi.fn(() => '/home/test-user'),
  tmpdirMock: vi.fn(() => '/tmp'),
  enableCompileCacheMock: vi.fn(() => ({
    status: 1,
    directory: '/tmp/node-compile-cache',
  })),
}));

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal()),
  existsSync: existsSyncMock,
  realpathSync: vi.fn((p) => p),
  readFileSync: vi.fn(() => JSON.stringify({ version: '0.0.0-test' })),
}));

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal()),
  homedir: homedirMock,
  tmpdir: tmpdirMock,
}));

// Mocked so the launcher never enables a real compile cache in the test worker.
vi.mock('node:module', () => ({
  default: {
    enableCompileCache: enableCompileCacheMock,
    constants: { compileCacheStatus: { ENABLED: 1, ALREADY_ENABLED: 2 } },
  },
}));

const normalizePath = (path) => String(path).replaceAll('\\', '/');

describe('scripts/cli-entry.js production entry', () => {
  const originalArgv = process.argv;
  let exitSpy;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    homedirMock.mockReturnValue('/home/test-user');
    tmpdirMock.mockReturnValue('/tmp');
    // Every import stamps these into the real process.env, and the pin's
    // bootstrap guard cannot tell two imports of this file apart — Vitest drops
    // the cache-buster query from import.meta.url — so a leftover pin would be
    // honoured as an inherited managed-version pin and its updateRoot would win
    // over the home this test is trying to observe. Each test here drives a
    // top-level invocation, which starts with neither.
    delete process.env.O1CODE_MANAGED_NPM_PIN;
    delete process.env.O1CODE_MANAGED_NPM_ROOT;
    // A non-fast-path command, so the entry takes the spawnSync branch (mocked)
    // instead of importing the real dist/cli.js in-process.
    process.argv = ['node', 'scripts/cli-entry.js', 'review', 'check'];
    // The entry exits after its child returns; the import must survive that.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.argv = originalArgv;
    exitSpy.mockRestore();
  });

  it('stamps O1CODE_CLI with its own path, overriding an inherited one', async () => {
    // The dev and start launchers had this pin; the production entry — the one
    // every npm install actually runs — did not, so a regression back to
    // honouring an inherited value would route installed review subprocesses to
    // an outer or stale CLI with every test green.
    const inherited = process.env.O1CODE_CLI;
    process.env.O1CODE_CLI = '/somewhere/else/entirely/o1-code';
    try {
      await import('../cli-entry.js?stamps-own-cli');
      expect(normalizePath(process.env.O1CODE_CLI)).toMatch(
        /scripts\/cli-entry\.js$/,
      );
    } finally {
      if (inherited === undefined) delete process.env.O1CODE_CLI;
      else process.env.O1CODE_CLI = inherited;
    }
  });

  it('preserves the startup version in child review commands', async () => {
    const inherited = process.env.O1CODE_STARTUP_VERSION;
    process.env.O1CODE_STARTUP_VERSION = '0.21.3';
    try {
      await import('../cli-entry.js?stamps-version');
      expect(process.env.O1CODE_STARTUP_VERSION).toBe('0.21.3');
      // And the value rides the spawned child's env — the hop that actually
      // reaches the submit handler — not merely the parent's copy.
      const spawnEnv = spawnSyncMock.mock.calls.at(-1)?.[2]?.env;
      expect(spawnEnv.O1CODE_STARTUP_VERSION).toBe('0.21.3');
    } finally {
      if (inherited === undefined) delete process.env.O1CODE_STARTUP_VERSION;
      else process.env.O1CODE_STARTUP_VERSION = inherited;
    }
  });

  it('initializes the version for a fresh CLI process', async () => {
    const inherited = process.env.O1CODE_STARTUP_VERSION;
    delete process.env.O1CODE_STARTUP_VERSION;
    try {
      await import('../cli-entry.js?initializes-version');
      expect(process.env.O1CODE_STARTUP_VERSION).toBe('0.0.0-test');
    } finally {
      if (inherited === undefined) delete process.env.O1CODE_STARTUP_VERSION;
      else process.env.O1CODE_STARTUP_VERSION = inherited;
    }
  });

  it('clears the startup version before a managed-update relaunch', async () => {
    // Behavioural, not source-text: the update child exits 44, and the
    // relaunch through the launcher must NOT inherit the old session's
    // stamp, so the new build stamps its own version.
    const inherited = process.env.O1CODE_STARTUP_VERSION;
    const inheritedShim = process.env.O1CODE_LAUNCHER_PATH;
    process.env.O1CODE_STARTUP_VERSION = '0.21.3';
    process.env.O1CODE_LAUNCHER_PATH = '/opt/o1-code-standalone/bin/o1-code';
    existsSyncMock.mockImplementation(
      (p) => normalizePath(p) === '/opt/o1-code-standalone/bin/o1-code',
    );
    // Snapshot the env AT call time: the mock records the object by
    // reference, so asserting on it later would let a delete that happens
    // AFTER the spawn mutate the record and hide the regression.
    const spawnEnvs = [];
    const spawnImpl = spawnSyncMock.getMockImplementation();
    spawnSyncMock.mockImplementation((_cmd, _args, opts) => {
      spawnEnvs.push({ ...opts.env });
      return spawnEnvs.length === 1
        ? { status: 44, signal: null }
        : { status: 0, signal: null };
    });
    try {
      await import('../cli-entry.js?clears-version-on-relaunch');
      expect(spawnEnvs).toHaveLength(2);
      // The pre-update child inherits the session's stamp...
      expect(spawnEnvs[0].O1CODE_STARTUP_VERSION).toBe('0.21.3');
      // ...and the post-update relaunch does not.
      expect('O1CODE_STARTUP_VERSION' in spawnEnvs[1]).toBe(false);
    } finally {
      spawnSyncMock.mockImplementation(spawnImpl);
      existsSyncMock.mockImplementation(() => false);
      if (inherited === undefined) delete process.env.O1CODE_STARTUP_VERSION;
      else process.env.O1CODE_STARTUP_VERSION = inherited;
      if (inheritedShim === undefined) delete process.env.O1CODE_LAUNCHER_PATH;
      else process.env.O1CODE_LAUNCHER_PATH = inheritedShim;
    }
  });

  describe('post-update relaunch through a Windows .cmd launcher', () => {
    // npm's global bin on Windows is a .cmd shim, so every managed update
    // relaunches through cmd.exe.
    const launcher = 'C:\\Users\\test\\AppData\\Roaming\\npm\\o1-code.cmd';
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    let inheritedShim;
    let stderrSpy;
    let spawnImpl;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      inheritedShim = process.env.O1CODE_LAUNCHER_PATH;
      stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      spawnImpl = spawnSyncMock.getMockImplementation();
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', platform);
      spawnSyncMock.mockImplementation(spawnImpl);
      existsSyncMock.mockImplementation(() => false);
      stderrSpy.mockRestore();
      if (inheritedShim === undefined) delete process.env.O1CODE_LAUNCHER_PATH;
      else process.env.O1CODE_LAUNCHER_PATH = inheritedShim;
    });

    it('hands the command line to cmd.exe verbatim', async () => {
      // cmd.exe does not understand Node's argv escaping: it rewrites the
      // embedded quotes of ""…"" as \" and then fails with
      // '\"\"C:\...\o1-code.cmd\"\"' is not recognized.
      process.env.O1CODE_LAUNCHER_PATH = launcher;
      existsSyncMock.mockImplementation((p) => p === launcher);
      const spawns = [];
      spawnSyncMock.mockImplementation((cmd, args, opts) => {
        spawns.push({ cmd, args, opts });
        return spawns.length === 1
          ? { status: 44, signal: null }
          : { status: 0, signal: null };
      });

      await import('../cli-entry.js?verbatim-cmd-relaunch');

      expect(spawns).toHaveLength(2);
      expect(spawns[1].cmd).toBe(process.env.ComSpec ?? 'cmd.exe');
      expect(spawns[1].args).toEqual(['/d', '/s', '/c', `""${launcher}""`]);
      expect(spawns[1].opts.windowsVerbatimArguments).toBe(true);
    });

    it('skips the relaunch when the launcher path carries cmd metacharacters', async () => {
      // Verbatim mode drops Node's escaping, so such a path would be split
      // into extra commands; the update itself already landed.
      const unsafe = 'C:\\Users\\a&b\\AppData\\Roaming\\npm\\o1-code.cmd';
      process.env.O1CODE_LAUNCHER_PATH = unsafe;
      existsSyncMock.mockImplementation((p) => p === unsafe);
      let spawnCount = 0;
      spawnSyncMock.mockImplementation(() => {
        spawnCount += 1;
        return { status: 44, signal: null };
      });

      await import('../cli-entry.js?unsafe-cmd-launcher');

      expect(spawnCount).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(
        'Update successful! The new version will be used on your next run.\n',
      );
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  it('leaves the startup version unset when package metadata is unreadable', async () => {
    const inherited = process.env.O1CODE_STARTUP_VERSION;
    delete process.env.O1CODE_STARTUP_VERSION;
    const readFileSyncMock = vi.mocked(readFileSync);
    const impl = readFileSyncMock.getMockImplementation();
    readFileSyncMock.mockImplementation(() => {
      throw new Error('unreadable');
    });
    try {
      await import('../cli-entry.js?unreadable-metadata');
      expect(process.env.O1CODE_STARTUP_VERSION).toBeUndefined();
    } finally {
      readFileSyncMock.mockImplementation(impl);
      if (inherited === undefined) delete process.env.O1CODE_STARTUP_VERSION;
      else process.env.O1CODE_STARTUP_VERSION = inherited;
    }
  });

  it('stamps unknown when the package metadata has no version', async () => {
    const inherited = process.env.O1CODE_STARTUP_VERSION;
    delete process.env.O1CODE_STARTUP_VERSION;
    const readFileSyncMock = vi.mocked(readFileSync);
    const impl = readFileSyncMock.getMockImplementation();
    readFileSyncMock.mockImplementation(() => '{}');
    try {
      await import('../cli-entry.js?versionless-metadata');
      expect(process.env.O1CODE_STARTUP_VERSION).toBe('unknown');
    } finally {
      readFileSyncMock.mockImplementation(impl);
      if (inherited === undefined) delete process.env.O1CODE_STARTUP_VERSION;
      else process.env.O1CODE_STARTUP_VERSION = inherited;
    }
  });

  it('prefers the standalone launcher shim, which carries the bundled Node', async () => {
    // The standalone package launches this file through `bin/o1-code`, a shim that
    // selects the BUNDLED Node — the host may have none — and announces itself
    // via O1CODE_LAUNCHER_PATH. There, stamping this file would hand every
    // subprocess a `#!/usr/bin/env node` script on a machine where that resolves
    // to nothing. The shim is the entry that reaches this build; stamp it.
    const inheritedCli = process.env.O1CODE_CLI;
    const inheritedShim = process.env.O1CODE_LAUNCHER_PATH;
    process.env.O1CODE_LAUNCHER_PATH = '/opt/o1-code-standalone/bin/o1-code';
    delete process.env.O1CODE_CLI;
    existsSyncMock.mockImplementation(
      (p) => normalizePath(p) === '/opt/o1-code-standalone/bin/o1-code',
    );
    try {
      await import('../cli-entry.js?stamps-shim');
      expect(process.env.O1CODE_CLI).toBe(
        '/opt/o1-code-standalone/bin/o1-code',
      );
      // And the hint is CONSUMED, not leaked: the serve/mcp fast path never
      // reaches the spawn branch that used to delete it, and a child o1-code from
      // a different checkout would read the leftover shim and republish it as
      // its own entry — the wrong build, wearing this one's stamp.
      expect('O1CODE_LAUNCHER_PATH' in process.env).toBe(false);
    } finally {
      if (inheritedCli === undefined) delete process.env.O1CODE_CLI;
      else process.env.O1CODE_CLI = inheritedCli;
      if (inheritedShim === undefined) delete process.env.O1CODE_LAUNCHER_PATH;
      else process.env.O1CODE_LAUNCHER_PATH = inheritedShim;
    }
  });

  it('hands the compile cache to the spawned CLI', async () => {
    // Without it every spawned run — one-shot `-p` included — recompiles the
    // whole bundle; only the in-process fast paths used to enable the cache.
    const inherited = process.env.NODE_COMPILE_CACHE;
    delete process.env.NODE_COMPILE_CACHE;
    try {
      await import('../cli-entry.js?compile-cache');
      const spawnEnv = spawnSyncMock.mock.calls.at(-1)?.[2]?.env;
      expect(spawnEnv.NODE_COMPILE_CACHE).toBe('/tmp/node-compile-cache');
    } finally {
      if (inherited === undefined) delete process.env.NODE_COMPILE_CACHE;
      else process.env.NODE_COMPILE_CACHE = inherited;
    }
  });

  it('keeps an inherited compile cache and a disabled one', async () => {
    const inherited = process.env.NODE_COMPILE_CACHE;
    process.env.NODE_COMPILE_CACHE = '/custom/cache';
    try {
      await import('../cli-entry.js?inherited-compile-cache');
      expect(spawnSyncMock.mock.calls.at(-1)?.[2]?.env.NODE_COMPILE_CACHE).toBe(
        '/custom/cache',
      );

      delete process.env.NODE_COMPILE_CACHE;
      // NODE_DISABLE_COMPILE_CACHE=1 makes Node report the cache as disabled.
      enableCompileCacheMock.mockReturnValueOnce({ status: 3 });
      vi.resetModules();
      await import('../cli-entry.js?disabled-compile-cache');
      expect(
        'NODE_COMPILE_CACHE' in spawnSyncMock.mock.calls.at(-1)[2].env,
      ).toBe(false);
    } finally {
      if (inherited === undefined) delete process.env.NODE_COMPILE_CACHE;
      else process.env.NODE_COMPILE_CACHE = inherited;
    }
  });

  it('falls back to tmpdir for tilde O1CODE_HOME when homedir is unavailable', async () => {
    const inheritedHome = process.env.O1CODE_HOME;
    homedirMock.mockImplementation(() => {
      throw new Error('homedir unavailable');
    });
    process.env.O1CODE_HOME = '~';
    try {
      await import('../cli-entry.js?tilde-home-fallback');
      expect(normalizePath(process.env.O1CODE_MANAGED_NPM_ROOT)).toBe(
        '/tmp/updates/npm',
      );
    } finally {
      if (inheritedHome === undefined) delete process.env.O1CODE_HOME;
      else process.env.O1CODE_HOME = inheritedHome;
    }
  });
});
