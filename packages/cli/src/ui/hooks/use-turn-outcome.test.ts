/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTurnOutcome } from './use-turn-outcome.js';
import { StreamingState, type HistoryItem } from '../types.js';

const user = (id: number, extra: Partial<HistoryItem> = {}): HistoryItem =>
  ({ id, type: 'user', text: `prompt ${id}`, ...extra }) as HistoryItem;
const item = (id: number, type: string): HistoryItem =>
  ({ id, type, text: type }) as HistoryItem;

function mount(initialHistory: HistoryItem[]) {
  const updateItem = vi.fn();
  const cancelledItemIdRef = { current: null as number | null };
  const hook = renderHook(
    ({ state, history }: { state: StreamingState; history: HistoryItem[] }) =>
      useTurnOutcome(state, history, updateItem, cancelledItemIdRef),
    { initialProps: { state: StreamingState.Idle, history: initialHistory } },
  );
  return { ...hook, updateItem, cancelledItemIdRef };
}

describe('useTurnOutcome', () => {
  it('marks the turn done when the stream goes idle', () => {
    const { rerender, updateItem } = mount([]);
    const history = [user(1), item(2, 'gemini')];
    rerender({ state: StreamingState.Responding, history });
    expect(updateItem).not.toHaveBeenCalled();
    rerender({ state: StreamingState.Idle, history });
    expect(updateItem).toHaveBeenCalledWith(1, { turnOutcome: 'done' });
  });

  it('marks the turn cancelled when the cancel handler named the message', () => {
    const { rerender, updateItem, cancelledItemIdRef } = mount([]);
    const history = [user(1), item(2, 'info')];
    rerender({ state: StreamingState.Responding, history });
    cancelledItemIdRef.current = 1;
    rerender({ state: StreamingState.Idle, history });
    expect(updateItem).toHaveBeenCalledWith(1, { turnOutcome: 'cancelled' });
    expect(cancelledItemIdRef.current).toBeNull();
  });

  it('marks the turn failed when it ends on an error', () => {
    const { rerender, updateItem } = mount([]);
    const history = [user(1), item(2, 'error')];
    rerender({ state: StreamingState.WaitingForConfirmation, history });
    rerender({ state: StreamingState.Idle, history });
    expect(updateItem).toHaveBeenCalledWith(1, { turnOutcome: 'error' });
  });

  it('leaves a message that already has an outcome alone', () => {
    const { rerender, updateItem } = mount([]);
    const history = [user(1, { turnOutcome: 'done' }), item(2, 'gemini')];
    rerender({ state: StreamingState.Responding, history });
    rerender({ state: StreamingState.Idle, history });
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('marks once per turn, not on every later history change', () => {
    const { rerender, updateItem } = mount([]);
    const history = [user(1)];
    rerender({ state: StreamingState.Responding, history });
    rerender({ state: StreamingState.Idle, history });
    rerender({
      state: StreamingState.Idle,
      history: [...history, item(2, 'info')],
    });
    expect(updateItem).toHaveBeenCalledTimes(1);
  });
});
