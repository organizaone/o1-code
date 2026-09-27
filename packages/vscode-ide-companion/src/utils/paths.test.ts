/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import {
  getGlobalO1CodeDir,
  getRuntimeBaseDir,
  resetEnvBootstrapForTesting,
} from './paths.js';

/**
 * Each test gets a clean temp homedir (no `.env` files), so the lazy
 * `bootstrapHomeEnvOverrides()` becomes a no-op unless the test explicitly
 * writes `.env` content into the mocked home. ESM bans spying on `os.homedir`,
 * so we redirect via the underlying `HOME` / `USERPROFILE` env vars.
 */
function withCleanHome() {
  const tempHome = fs.mkdtempSync(
    path.join(os.tmpdir(), 'o1-code-paths-test-'),
  );
  const realHome = fs.realpathSync(tempHome);
  const originalHomeEnv = process.env['HOME'];
  const originalUserProfile = process.env['USERPROFILE'];
  process.env['HOME'] = realHome;
  process.env['USERPROFILE'] = realHome;
  return {
    tempHome: realHome,
    cleanup: () => {
      if (originalHomeEnv !== undefined) {
        process.env['HOME'] = originalHomeEnv;
      } else {
        delete process.env['HOME'];
      }
      if (originalUserProfile !== undefined) {
        process.env['USERPROFILE'] = originalUserProfile;
      } else {
        delete process.env['USERPROFILE'];
      }
      fs.rmSync(realHome, { recursive: true, force: true });
    },
  };
}

describe('vscode-ide-companion paths – getGlobalO1CodeDir', () => {
  const originalEnv = process.env['O1CODE_HOME'];
  let home: ReturnType<typeof withCleanHome>;

  beforeEach(() => {
    resetEnvBootstrapForTesting();
    home = withCleanHome();
  });

  afterEach(() => {
    home.cleanup();
    if (originalEnv !== undefined) {
      process.env['O1CODE_HOME'] = originalEnv;
    } else {
      delete process.env['O1CODE_HOME'];
    }
  });

  it('defaults to ~/.o1-code when O1CODE_HOME is not set', () => {
    delete process.env['O1CODE_HOME'];
    expect(getGlobalO1CodeDir()).toBe(path.join(home.tempHome, '.o1-code'));
  });

  it('uses O1CODE_HOME when set to absolute path', () => {
    const configDir = path.resolve('/tmp/custom-o1-code');
    process.env['O1CODE_HOME'] = configDir;
    expect(getGlobalO1CodeDir()).toBe(configDir);
  });

  it('resolves relative O1CODE_HOME against process.cwd', () => {
    process.env['O1CODE_HOME'] = 'relative/config';
    expect(getGlobalO1CodeDir()).toBe(path.resolve('relative/config'));
  });

  it('expands tilde (~/x) in O1CODE_HOME', () => {
    process.env['O1CODE_HOME'] = '~/custom-o1-code';
    expect(getGlobalO1CodeDir()).toBe(
      path.join(home.tempHome, 'custom-o1-code'),
    );
  });

  it('expands Windows-style tilde (~\\x) in O1CODE_HOME', () => {
    process.env['O1CODE_HOME'] = '~\\custom-o1-code';
    expect(getGlobalO1CodeDir()).toBe(
      path.join(home.tempHome, 'custom-o1-code'),
    );
  });

  it('treats bare tilde (~) as home directory', () => {
    process.env['O1CODE_HOME'] = '~';
    expect(getGlobalO1CodeDir()).toBe(home.tempHome);
  });
});

describe('vscode-ide-companion paths – getRuntimeBaseDir', () => {
  const originalHome = process.env['O1CODE_HOME'];
  const originalRuntime = process.env['O1CODE_RUNTIME_DIR'];
  let home: ReturnType<typeof withCleanHome>;

  beforeEach(() => {
    resetEnvBootstrapForTesting();
    home = withCleanHome();
  });

  afterEach(() => {
    home.cleanup();
    if (originalHome !== undefined) {
      process.env['O1CODE_HOME'] = originalHome;
    } else {
      delete process.env['O1CODE_HOME'];
    }
    if (originalRuntime !== undefined) {
      process.env['O1CODE_RUNTIME_DIR'] = originalRuntime;
    } else {
      delete process.env['O1CODE_RUNTIME_DIR'];
    }
  });

  it('falls back to getGlobalO1CodeDir() when neither env var is set', () => {
    delete process.env['O1CODE_HOME'];
    delete process.env['O1CODE_RUNTIME_DIR'];
    expect(getRuntimeBaseDir()).toBe(getGlobalO1CodeDir());
  });

  it('uses O1CODE_RUNTIME_DIR when set to absolute path', () => {
    delete process.env['O1CODE_HOME'];
    const runtimeDir = path.resolve('/tmp/custom-runtime');
    process.env['O1CODE_RUNTIME_DIR'] = runtimeDir;
    expect(getRuntimeBaseDir()).toBe(runtimeDir);
  });

  it('resolves relative O1CODE_RUNTIME_DIR against process.cwd', () => {
    delete process.env['O1CODE_HOME'];
    process.env['O1CODE_RUNTIME_DIR'] = 'relative/runtime';
    expect(getRuntimeBaseDir()).toBe(path.resolve('relative/runtime'));
  });

  it('expands tilde (~/x) in O1CODE_RUNTIME_DIR', () => {
    delete process.env['O1CODE_HOME'];
    process.env['O1CODE_RUNTIME_DIR'] = '~/custom-runtime';
    expect(getRuntimeBaseDir()).toBe(
      path.join(home.tempHome, 'custom-runtime'),
    );
  });

  it('falls back to O1CODE_HOME when O1CODE_RUNTIME_DIR is unset', () => {
    delete process.env['O1CODE_RUNTIME_DIR'];
    const configDir = path.resolve('/tmp/custom-o1-code');
    process.env['O1CODE_HOME'] = configDir;
    expect(getRuntimeBaseDir()).toBe(configDir);
  });

  it('O1CODE_RUNTIME_DIR takes priority over O1CODE_HOME', () => {
    const configDir = path.resolve('/tmp/custom-o1-code');
    const runtimeDir = path.resolve('/tmp/custom-runtime');
    process.env['O1CODE_HOME'] = configDir;
    process.env['O1CODE_RUNTIME_DIR'] = runtimeDir;
    expect(getRuntimeBaseDir()).toBe(runtimeDir);
  });
});

describe('vscode-ide-companion paths – .env bootstrap', () => {
  const originalHome = process.env['O1CODE_HOME'];
  const originalRuntime = process.env['O1CODE_RUNTIME_DIR'];
  let home: ReturnType<typeof withCleanHome>;

  beforeEach(() => {
    resetEnvBootstrapForTesting();
    home = withCleanHome();
    delete process.env['O1CODE_HOME'];
    delete process.env['O1CODE_RUNTIME_DIR'];
  });

  afterEach(() => {
    home.cleanup();
    if (originalHome !== undefined) {
      process.env['O1CODE_HOME'] = originalHome;
    } else {
      delete process.env['O1CODE_HOME'];
    }
    if (originalRuntime !== undefined) {
      process.env['O1CODE_RUNTIME_DIR'] = originalRuntime;
    } else {
      delete process.env['O1CODE_RUNTIME_DIR'];
    }
  });

  it('reads O1CODE_HOME from <homedir>/.o1-code/.env', () => {
    const configDir = path.resolve('/tmp/from-o1-code-dotenv');
    fs.mkdirSync(path.join(home.tempHome, '.o1-code'), { recursive: true });
    fs.writeFileSync(
      path.join(home.tempHome, '.o1-code', '.env'),
      `O1CODE_HOME=${configDir}\n`,
    );
    expect(getGlobalO1CodeDir()).toBe(configDir);
    expect(process.env['O1CODE_HOME']).toBe(configDir);
  });

  it('reads O1CODE_HOME from <homedir>/.env when ~/.o1-code/.env is absent', () => {
    const configDir = path.resolve('/tmp/from-home-dotenv');
    fs.writeFileSync(
      path.join(home.tempHome, '.env'),
      `O1CODE_HOME=${configDir}\n`,
    );
    expect(getGlobalO1CodeDir()).toBe(configDir);
    expect(process.env['O1CODE_HOME']).toBe(configDir);
  });

  it('process env wins over .env file', () => {
    const envDir = path.resolve('/tmp/from-process-env');
    const dotenvDir = path.resolve('/tmp/from-dotenv');
    process.env['O1CODE_HOME'] = envDir;
    fs.mkdirSync(path.join(home.tempHome, '.o1-code'), { recursive: true });
    fs.writeFileSync(
      path.join(home.tempHome, '.o1-code', '.env'),
      `O1CODE_HOME=${dotenvDir}\n`,
    );
    expect(getGlobalO1CodeDir()).toBe(envDir);
  });

  it('reads O1CODE_RUNTIME_DIR from <O1CODE_HOME>/.env when O1CODE_HOME is preset', () => {
    const configDir = path.join(home.tempHome, 'custom-o1-code');
    const runtimeDir = path.resolve('/tmp/from-runtime-dotenv');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, '.env'),
      `O1CODE_RUNTIME_DIR=${runtimeDir}\n`,
    );
    process.env['O1CODE_HOME'] = configDir;
    expect(getRuntimeBaseDir()).toBe(runtimeDir);
  });

  it('does not read <homedir>/.env when O1CODE_HOME is preset', () => {
    const configDir = path.resolve('/tmp/preset-o1-code-home');
    process.env['O1CODE_HOME'] = configDir;
    fs.writeFileSync(
      path.join(home.tempHome, '.env'),
      `O1CODE_RUNTIME_DIR=/tmp/should-be-ignored\n`,
    );
    expect(getRuntimeBaseDir()).toBe(configDir);
    expect(process.env['O1CODE_RUNTIME_DIR']).toBeUndefined();
  });

  it('reads O1CODE_RUNTIME_DIR from <new O1CODE_HOME>/.env after discovery via ~/.o1-code/.env', () => {
    const configDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'o1-code-bootstrap-cfg-')),
    );
    const runtimeDir = path.resolve('/tmp/from-discovered-runtime');
    fs.mkdirSync(path.join(home.tempHome, '.o1-code'), { recursive: true });
    fs.writeFileSync(
      path.join(home.tempHome, '.o1-code', '.env'),
      `O1CODE_HOME=${configDir}\n`,
    );
    fs.writeFileSync(
      path.join(configDir, '.env'),
      `O1CODE_RUNTIME_DIR=${runtimeDir}\n`,
    );
    try {
      expect(getRuntimeBaseDir()).toBe(runtimeDir);
      expect(process.env['O1CODE_HOME']).toBe(configDir);
      expect(process.env['O1CODE_RUNTIME_DIR']).toBe(runtimeDir);
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });
});
