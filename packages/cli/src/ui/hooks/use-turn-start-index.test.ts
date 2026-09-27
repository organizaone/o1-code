/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTurnStartIndex } from './use-turn-start-index.js';
import { StreamingState } from '../types.js';

describe('useTurnStartIndex', () => {
  it('remembers the history length when a turn starts and keeps it for the turn', () => {
    const { result, rerender } = renderHook(
      ({ state, length }: { state: StreamingState; length: number }) =>
        useTurnStartIndex(state, length),
      { initialProps: { state: StreamingState.Idle, length: 4 } },
    );
    rerender({ state: StreamingState.Responding, length: 5 });
    expect(result.current).toBe(5);
    rerender({ state: StreamingState.Responding, length: 9 });
    expect(result.current).toBe(5);
    rerender({ state: StreamingState.Idle, length: 9 });
    rerender({ state: StreamingState.Responding, length: 10 });
    expect(result.current).toBe(10);
  });
});
