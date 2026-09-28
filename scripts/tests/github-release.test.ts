/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contentTypeOf, parseArgs } from '../o1/github-release.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('github-release', () => {
  // The direct-run guard must let main run on POSIX: with no arguments the
  // script fails with the usage error. A mismatched guard exits 0 having
  // done nothing — the silent no-op that marked v0.2.0's workflow green
  // without creating the release.
  it('runs its main on POSIX instead of exiting silently', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/o1/github-release.mjs'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('usage: github-release.mjs');
  });

  it('parses the arguments', () => {
    const options = parseArgs([
      'v1.2.3',
      '--title',
      'T',
      '--notes-file',
      'n.md',
      '--asset',
      'a.tgz',
      '--asset',
      'b.tgz',
    ]);
    expect(options).toEqual({
      tag: 'v1.2.3',
      title: 'T',
      notesFile: 'n.md',
      assets: ['a.tgz', 'b.tgz'],
      repo: undefined,
    });
  });

  it('rejects an unknown option', () => {
    expect(() =>
      parseArgs(['v1', '--title', 'T', '--notes-file', 'n', '--nope', 'x']),
    ).toThrow('unknown option --nope');
  });

  it('maps asset content types', () => {
    expect(contentTypeOf('x.tgz')).toBe('application/gzip');
    expect(contentTypeOf('x.tar.gz')).toBe('application/gzip');
    expect(contentTypeOf('x.zip')).toBe('application/zip');
    expect(contentTypeOf('x.json')).toBe('application/json');
    expect(contentTypeOf('x.md')).toBe('text/plain');
    expect(contentTypeOf('x.bin')).toBe('application/octet-stream');
  });
});
