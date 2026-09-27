/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { LiveThinkingLine, ThinkingLine } from './ThinkingLine.js';
import { StreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import type { Config } from '@organizaone/o1-code-core';

const frame = (node: React.ReactElement) =>
  stripAnsi(
    render(
      <StreamingContext.Provider value={StreamingState.Responding}>
        {node}
      </StreamingContext.Provider>,
    ).lastFrame() ?? '',
  );

describe('ThinkingLine', () => {
  it('shows the phrase, the elapsed time and how to cancel', () => {
    expect(frame(<ThinkingLine elapsedSeconds={8.4} />)).toContain(
      'thinking… 8s · esc to cancel',
    );
  });

  it('reads the elapsed time from the turn clock', () => {
    expect(
      frame(
        <LiveThinkingLine
          elapsedClock={{ accumulatedMs: 12_000, runningSinceMs: null }}
        />,
      ),
    ).toContain('thinking… 12s · esc to cancel');
  });

  it('shows minutes on a long turn, as the footer does', () => {
    expect(frame(<ThinkingLine elapsedSeconds={302} />)).toContain(
      'thinking… 5m 02s · esc to cancel',
    );
  });

  it('uses the loading phrase when there is one', () => {
    expect(
      frame(<ThinkingLine phrase="Reading files" elapsedSeconds={2} />),
    ).toContain('Reading files 2s · esc to cancel');
  });

  it('drops the phrase when loading phrases are turned off', () => {
    const config = {
      getAccessibility: () => ({ enableLoadingPhrases: false }),
    } as unknown as Config;
    expect(
      frame(
        <ConfigContext.Provider value={config}>
          <ThinkingLine phrase="Mining Dilithium" elapsedSeconds={3} />
        </ConfigContext.Provider>,
      ),
    ).toContain('thinking… 3s · esc to cancel');
  });
});
