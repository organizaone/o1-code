/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Box } from 'ink';
import stripAnsi from 'strip-ansi';
import { QueuedMessageDisplay, getQueueRows } from './QueuedMessageDisplay.js';

const lines = (node: React.ReactElement) =>
  stripAnsi(render(node).lastFrame() ?? '')
    .replaceAll('︎', '')
    .split('\n');

describe('QueuedMessageDisplay', () => {
  it('renders nothing when the queue is empty', () => {
    expect(render(<QueuedMessageDisplay messageQueue={[]} />).lastFrame()).toBe(
      '',
    );
  });

  it('marks each message with ↳ and counts the queue on the last row', () => {
    const rows = lines(
      <Box width={80}>
        <QueuedMessageDisplay messageQueue={['run the tests', 'open the PR']} />
      </Box>,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.trimStart().startsWith('↳ run the tests')).toBe(true);
    expect(rows[0]).not.toContain('queued');
    expect(rows[1]).toContain('↳ open the PR');
    expect(rows[1]!.trimEnd().endsWith('2 queued · ↑ edit')).toBe(true);
  });

  it('shows at most three messages and counts the rest', () => {
    const rows = lines(
      <Box width={80}>
        <QueuedMessageDisplay messageQueue={['a', 'b', 'c', 'd', 'e']} />
      </Box>,
    );
    expect(rows).toHaveLength(3);
    expect(rows[2]!.trimEnd().endsWith('… 2 more · 5 queued · ↑ edit')).toBe(
      true,
    );
  });

  it('keeps a long or multi-line message on one truncated row', () => {
    const rows = lines(
      <Box width={40}>
        <QueuedMessageDisplay
          messageQueue={[`first line\nsecond ${'x'.repeat(80)}`]}
        />
      </Box>,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('first line second');
    expect(rows[0]!.trimEnd().endsWith('1 queued · ↑ edit')).toBe(true);
  });

  it('hides the hint when asked', () => {
    const rows = lines(
      <Box width={80}>
        <QueuedMessageDisplay messageQueue={['a']} showHint={false} />
      </Box>,
    );
    expect(rows[0]).not.toContain('queued');
  });

  it('still counts the hidden messages when the hint is off', () => {
    const rows = lines(
      <Box width={80}>
        <QueuedMessageDisplay
          messageQueue={['a', 'b', 'c', 'd', 'e']}
          showHint={false}
        />
      </Box>,
    );
    expect(rows).toHaveLength(3);
    expect(rows[2]!.trimEnd().endsWith('… 2 more')).toBe(true);
    expect(rows[2]).not.toContain('queued');
  });

  it('reports the rows it renders', () => {
    expect([0, 1, 3, 5].map(getQueueRows)).toEqual([0, 1, 3, 3]);
  });
});
