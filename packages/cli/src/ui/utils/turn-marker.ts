/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItem, HistoryItemWithoutId } from '../types.js';
import { StreamingState } from '../types.js';
import { findLastUserItemIndex } from './historyUtils.js';

/**
 * `waiting`: the turn runs but nothing has appeared under the message yet,
 * neither committed items nor pending ones. `running`: the agent has shown
 * something (a thought, text, a tool row).
 */
export type LiveTurnMarker = 'waiting' | 'running';

export interface LiveTurn {
  /** Id of the user history item that started the running turn. */
  itemId: number;
  marker: LiveTurnMarker;
}

/**
 * The user message whose turn is running, and whether the agent has shown
 * anything for it yet. Null while idle, when the turn has no user message
 * (a cron prompt, a goal continuation), and when the last user message
 * already carries an outcome, so a later turn without a message of its own
 * never re-animates it.
 */
export function getLiveTurn(
  streamingState: StreamingState,
  history: readonly HistoryItem[],
  pendingHistoryItems: readonly HistoryItemWithoutId[],
): LiveTurn | null {
  if (streamingState === StreamingState.Idle) return null;
  const index = findLastUserItemIndex(history);
  if (index === -1) return null;
  const item = history[index];
  if (item.type !== 'user' || item.turnOutcome !== undefined) return null;
  const marker: LiveTurnMarker =
    index === history.length - 1 && pendingHistoryItems.length === 0
      ? 'waiting'
      : 'running';
  return { itemId: item.id, marker };
}
