/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'check-guides.mjs');
const guidesDir = resolve(here, '..', '..', 'docs', 'guides');
const GUIDES = [
  'AGENT-WORKFLOW.md',
  'TASK-COMPLETION.md',
  'COMMITS.md',
  'VERSIONING.md',
  'AUTONOMOUS-EXECUTION.md',
];

function run(source) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, O1CODE_GUIDES_SOURCE: source },
  });
}

/** A source tree whose guides match the copies' bodies. */
function matchingSource() {
  const dir = mkdtempSync(join(tmpdir(), 'check-guides-'));
  for (const guide of GUIDES) {
    const copy = readFileSync(join(guidesDir, guide), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    const at = copy.search(
      /## (Desvios deste projeto|Deviations in this project)/,
    );
    assert.notEqual(at, -1, `${guide} has a deviations heading`);
    writeFileSync(join(dir, guide), `${copy.slice(0, at).trimEnd()}\n`);
  }
  return dir;
}

test('a missing source is reported as skipped and does not fail', () => {
  const missing = join(tmpdir(), 'check-guides-no-such-source');
  const result = run(missing);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /source not found, skipped/);
  assert.ok(result.stdout.includes(missing));
});

test('passes when every copy matches its source', (t) => {
  const source = matchingSource();
  t.after(() => rmSync(source, { recursive: true, force: true }));
  const result = run(source);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /5 guide\(s\), 0 problem\(s\)/);
});

test('stays strict when the source exists and a copy has drifted', (t) => {
  const source = matchingSource();
  t.after(() => rmSync(source, { recursive: true, force: true }));
  writeFileSync(join(source, 'COMMITS.md'), 'a different body\n');
  const result = run(source);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /COMMITS\.md: body diverges from the source/);
});

test('stays strict when the source exists but lacks a guide', (t) => {
  const source = matchingSource();
  t.after(() => rmSync(source, { recursive: true, force: true }));
  rmSync(join(source, 'VERSIONING.md'));
  const result = run(source);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /VERSIONING\.md: missing in the source/);
});
