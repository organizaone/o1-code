/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSecondsSince, useTurnStartedAt } from './use-turn-clock.js';
import { StreamingState } from '../types.js';

describe('useTurnStartedAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the start of the whole turn, approvals included', () => {
    const start = Date.now();
    const { result, rerender } = renderHook(
      ({ state }: { state: StreamingState }) => useTurnStartedAt(state),
      { initialProps: { state: StreamingState.Responding } },
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    rerender({ state: StreamingState.WaitingForConfirmation });
    rerender({ state: StreamingState.Responding });

    expect(result.current).toBe(start);
  });

  it('starts over with the next turn', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: StreamingState }) => useTurnStartedAt(state),
      { initialProps: { state: StreamingState.Responding } },
    );
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    rerender({ state: StreamingState.Idle });
    expect(result.current).toBeUndefined();
    const next = Date.now();
    rerender({ state: StreamingState.Responding });

    expect(result.current).toBe(next);
  });

  it('does not render again while the turn runs', () => {
    // The app container calls it: a tick here would redraw the whole app.
    let renders = 0;
    renderHook(() => {
      renders++;
      return useTurnStartedAt(StreamingState.Responding);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(renders).toBe(1);
  });
});

describe('useSecondsSince', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the seconds since a moment, once a second', () => {
    const startedAt = Date.now() - 2000;
    const { result } = renderHook(() => useSecondsSince(startedAt));
    expect(result.current).toBe(2);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current).toBe(5);
  });

  it('has nothing to count without a moment', () => {
    const { result } = renderHook(() => useSecondsSince(undefined));
    expect(result.current).toBeUndefined();
  });
});
