// Copyright 2026 o1-code contributors
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  companionAssetName,
  writeCompanionChecksum,
  verifyReusableCompanionBuild,
  prepareCompanionAssets,
} from './companion-artifact.mjs';
import { mkdirSync } from 'node:fs';
test('names each companion artifact for the exact release and native target', () => {
  for (const target of [
    'win32-x64',
    'win32-arm64',
    'darwin-x64',
    'darwin-arm64',
    'linux-x64',
  ]) {
    assert.equal(
      companionAssetName('0.21.7', target),
      `o1-code-vscode-ide-companion-0.21.7-${target}.vsix`,
    );
  }
  assert.throws(() => companionAssetName('latest', 'win32-x64'), /version/);
  assert.throws(() => companionAssetName('0.21.7', 'linux-arm64'), /target/);
});
test('repairs an interrupted upload checksum using the existing GitHub VSIX digest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-retry-'));
  try {
    const file = join(dir, 'test.vsix');
    writeFileSync(file, 'new zip timestamps');
    const hash = 'a'.repeat(64);
    const assets = prepareCompanionAssets(file, [
      { name: 'test.vsix', digest: 'sha256:' + hash },
    ]);
    assert.equal(assets[1].data.toString(), `${hash}  test.vsix\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('refuses a conflicting previously uploaded checksum', () => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-conflict-'));
  try {
    const file = join(dir, 'test.vsix');
    writeFileSync(file, 'abc');
    assert.throws(
      () =>
        prepareCompanionAssets(file, [
          { name: 'test.vsix', digest: 'sha256:' + 'a'.repeat(64) },
          { name: 'test.vsix.sha256', digest: 'sha256:' + 'b'.repeat(64) },
        ]),
      /conflicts/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('writes a standard checksum file next to the immutable VSIX', () => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-artifact-'));
  try {
    const file = join(dir, 'test.vsix');
    writeFileSync(file, 'abc');
    assert.equal(writeCompanionChecksum(file), file + '.sha256');
    assert.equal(
      readFileSync(file + '.sha256', 'utf8'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  test.vsix\n',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('rejects a reusable CLI build from a different version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-build-'));
  try {
    mkdirSync(join(dir, 'dist'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ version: '0.21.7' }),
    );
    writeFileSync(
      join(dir, 'dist', 'package.json'),
      JSON.stringify({ version: '0.21.6' }),
    );
    assert.throws(() => verifyReusableCompanionBuild(dir), /version/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
