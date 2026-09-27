/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractReleaseNotes } from './release-notes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'release-notes.mjs');

const CHANGELOG = `# Changelog

All notable changes are documented here.

## [Unreleased]

- Something not released yet.

## [0.2.0] - 2026-10-01

### Added

- A second release.

## [0.1.10] - 2026-09-30

- A version that shares a prefix with 0.1.1.

## [0.1.1] - 2026-09-29

## [0.1.0] - 2026-09-27

The first release.

### Terminal interface

- A layout.

[0.2.0]: https://example.com/compare/v0.1.10...v0.2.0
[0.1.0]: https://example.com/releases/tag/v0.1.0
`;

function withChangelog(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
  try {
    const file = join(dir, 'CHANGELOG.md');
    writeFileSync(file, content);
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('returns the body of a middle section, without its heading', () => {
  assert.equal(
    extractReleaseNotes(CHANGELOG, '0.2.0'),
    '### Added\n\n- A second release.',
  );
});

test('stops the last section before the link references', () => {
  assert.equal(
    extractReleaseNotes(CHANGELOG, '0.1.0'),
    'The first release.\n\n### Terminal interface\n\n- A layout.',
  );
});

test('does not match a version that only shares a prefix', () => {
  assert.equal(
    extractReleaseNotes(CHANGELOG, '0.1.10'),
    '- A version that shares a prefix with 0.1.1.',
  );
  assert.throws(() => extractReleaseNotes(CHANGELOG, '0.1.1'), /is empty/);
});

test('reads Windows line endings', () => {
  assert.equal(
    extractReleaseNotes(CHANGELOG.replace(/\n/g, '\r\n'), '0.2.0'),
    '### Added\n\n- A second release.',
  );
});

test('fails with a clear message when the section is missing', () => {
  assert.throws(
    () => extractReleaseNotes(CHANGELOG, '9.9.9'),
    /No "## \[9\.9\.9\]" section/,
  );
});

test('the command prints the section of the given changelog', () => {
  withChangelog(CHANGELOG, (file) => {
    const result = run(['0.2.0', '--changelog', file]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '### Added\n\n- A second release.\n');
  });
});

test('the command accepts a tag with a leading v', () => {
  withChangelog(CHANGELOG, (file) => {
    const result = run(['v0.2.0', '--changelog', file]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '### Added\n\n- A second release.\n');
  });
});

test('the command exits 1 when the section is missing or empty', () => {
  withChangelog(CHANGELOG, (file) => {
    const missing = run(['9.9.9', '--changelog', file]);
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /No "## \[9\.9\.9\]" section/);

    const empty = run(['0.1.1', '--changelog', file]);
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /\[0\.1\.1\].*is empty/);
  });
});

test('the command exits 1 without a version', () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: /);
});

test('the command reads the repository changelog by default', () => {
  const result = run(['0.1.0']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\S/);
  assert.doesNotMatch(result.stdout, /^## \[/m);
});
