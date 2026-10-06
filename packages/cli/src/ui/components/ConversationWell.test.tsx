/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import stripAnsi from 'strip-ansi';
import {
  ConversationWell,
  getConversationChromeHeight,
} from './ConversationWell.js';

const frame = (queue: string[], viewportHeight = 6) =>
  stripAnsi(
    render(
      <Box width={60}>
        <ConversationWell viewportHeight={viewportHeight} messageQueue={queue}>
          <Text>history line</Text>
        </ConversationWell>
      </Box>,
    ).lastFrame() ?? '',
  )
    .replaceAll('︎', '')
    .split('\n');

describe('ConversationWell', () => {
  it('draws a rounded border of fixed height around a short history', () => {
    const rows = frame([]);
    expect(rows).toHaveLength(6 + 2);
    expect(rows[0]!.startsWith('╭')).toBe(true);
    expect(rows[rows.length - 1]!.startsWith('╰')).toBe(true);
    expect(rows[1]).toContain('history line');
  });

  it('pins the queue to the bottom of the well', () => {
    const rows = frame(['run the tests', 'open the PR']);
    expect(rows).toHaveLength(6 + 2 + 2);
    expect(rows[rows.length - 3]).toContain('↳ run the tests');
    expect(rows[rows.length - 2]).toContain('↳ open the PR');
    expect(rows[rows.length - 2]).toContain('2 queued');
  });

  it('puts the thinking line above the queue and counts its row', () => {
    const rows = stripAnsi(
      render(
        <Box width={60}>
          <ConversationWell
            viewportHeight={4}
            messageQueue={['next']}
            thinking={<Text>THINKING</Text>}
          >
            <Text>history</Text>
          </ConversationWell>
        </Box>,
      ).lastFrame() ?? '',
    ).split('\n');
    expect(rows).toHaveLength(4 + getConversationChromeHeight(1, true));
    expect(rows[rows.length - 3]).toContain('THINKING');
    expect(rows[rows.length - 4].replaceAll('│', '').trim()).toBe('');
    expect(rows[rows.length - 2]).toContain('next');
  });

  it('reports the rows it adds around the viewport', () => {
    expect([0, 1, 3, 7].map((n) => getConversationChromeHeight(n))).toEqual([
      2, 3, 5, 5,
    ]);
  });
});
