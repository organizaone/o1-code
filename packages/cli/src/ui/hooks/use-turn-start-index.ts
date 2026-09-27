/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef } from 'react';
import { StreamingState } from '../types.js';

/**
 * Where the running turn starts in the history. Turns started by a
 * notification, a teammate or a schedule add no user message, so the start is
 * taken as the history length when the session leaves idle.
 */
export function useTurnStartIndex(
  streamingState: StreamingState,
  historyLength: number,
): number {
  const startRef = useRef(historyLength);
  const wasIdleRef = useRef(true);
  const idle = streamingState === StreamingState.Idle;
  if (!idle && wasIdleRef.current) startRef.current = historyLength;
  wasIdleRef.current = idle;
  return startRef.current;
}
