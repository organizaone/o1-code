/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, type RefObject } from 'react';
import { StreamingState, type HistoryItem } from '../types.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { findLastUserItemIndex } from '../utils/historyUtils.js';

/**
 * Records on the user message that started a turn how the turn ended, the
 * moment the stream goes idle: `cancelled` when the cancel handler named
 * that message, `error` when the turn's last item is an error, `done`
 * otherwise. One history update per turn; a message that already carries
 * an outcome is left alone, so a turn without a message of its own (a cron
 * prompt, a goal continuation) marks nothing.
 */
export function useTurnOutcome(
  streamingState: StreamingState,
  history: readonly HistoryItem[],
  updateItem: UseHistoryManagerReturn['updateItem'],
  cancelledItemIdRef: RefObject<number | null>,
): void {
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const active = streamingState !== StreamingState.Idle;
    if (wasActiveRef.current && !active) {
      const index = findLastUserItemIndex(history);
      const item = index === -1 ? undefined : history[index];
      if (item?.type === 'user' && item.turnOutcome === undefined) {
        const outcome =
          cancelledItemIdRef.current === item.id
            ? 'cancelled'
            : history[history.length - 1]?.type === 'error'
              ? 'error'
              : 'done';
        updateItem(item.id, { turnOutcome: outcome });
      }
      cancelledItemIdRef.current = null;
    }
    wasActiveRef.current = active;
  }, [streamingState, history, updateItem, cancelledItemIdRef]);
}
