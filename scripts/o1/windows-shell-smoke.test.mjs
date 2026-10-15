// Copyright 2026 o1-code contributors
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  quoteArgument,
  assessFixture,
  createSmokeEnvironment,
} from './windows-shell-smoke.mjs';

test('isolated settings preserve an existing Scoop installation for shell discovery', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'o1-smoke-env-'));
  try {
    const profile = path.join(root, 'real-user');
    const home = path.join(root, 'isolated-user');
    mkdirSync(path.join(profile, 'scoop'), { recursive: true });
    const environment = createSmokeEnvironment(home, {
      USERPROFILE: profile,
      HOME: profile,
      PATH: 'original-shims',
    });
    assert.equal(environment.SCOOP, path.join(profile, 'scoop'));
    assert.equal(environment.USERPROFILE, profile);
    assert.equal(environment.HOME, home);
    assert.equal(environment.O1CODE_HOME, path.join(home, '.o1-code'));
    assert.equal(environment.PATH, 'original-shims');
    assert.equal(
      createSmokeEnvironment(home, { USERPROFILE: root }).SCOOP,
      undefined,
    );
    assert.equal(
      createSmokeEnvironment(home, {
        USERPROFILE: profile,
        SCOOP: 'explicit-scoop',
      }).SCOOP,
      'explicit-scoop',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Bash quoting preserves spaces, accents and apostrophes through a real shell', () => {
  if (process.platform === 'win32') return;
  const value = "ação with ' quotes and $HOME";
  const result = spawnSync(
    'bash',
    ['-c', `printf '%s' ${quoteArgument(value, 'bash')}`],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, value);
});

test('fixture assessment rejects dropped or altered Java-like argument arrays', () => {
  const args = [
    'space value',
    'ação',
    '/flag',
    '--class-path',
    'lib one;lib two',
  ];
  assert.equal(assessFixture({ args }, args).status, 'pass');
  assert.equal(assessFixture({ args: args.slice(0, -1) }, args).status, 'fail');
});

test('MSYS native slash conversion is reported as unverified with actual evidence', () => {
  const args = [
    'space value',
    'ação',
    '/flag',
    '--class-path',
    'lib one;lib two',
  ];
  const result = assessFixture(
    { args: args.map((arg) => (arg === '/flag' ? 'C:/Git/flag' : arg)) },
    args,
  );
  assert.equal(result.status, 'unverified');
  assert.match(result.detail, /C:\/Git\/flag/);
});

test('missing actual shell execution cannot pass', () => {
  assert.equal(assessFixture(undefined, []).status, 'fail');
});
