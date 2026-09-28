/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReleaseHighlights, highlightOf } from './release-highlights.mjs';

const changelog = `# Changelog

## [Unreleased]

- Not released yet.

## [0.2.1] - 2026-09-28

### Fixed

- Search works again after installing from npm. 0.2.0 shipped its bundled
  ripgrep without the execute permission.
- \`/effort\` offers **default** first.

## [0.2.0] - 2026-09-27

- The README opens on [what o1-code is](./README.md).

[0.2.0]: https://example.test
`;

test('keeps released versions only, one highlight per top-level entry', () => {
  assert.deepEqual(buildReleaseHighlights(changelog), {
    '0.2.1': {
      highlights: [
        'Search works again after installing from npm.',
        '/effort offers default first.',
      ],
    },
    '0.2.0': { highlights: ['The README opens on what o1-code is.'] },
  });
});

test('cuts a long entry at its first clause, then at a length limit', () => {
  const clause = `A message you sent now stands apart from the reply and the tool rows: ${'x '.repeat(60)}.`;
  assert.equal(
    highlightOf(clause),
    'A message you sent now stands apart from the reply and the tool rows',
  );
  const long = `${'word '.repeat(40)}end.`;
  assert.ok(highlightOf(long).endsWith('…'));
  assert.ok(highlightOf(long).length <= 110);
});
