/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { StreamingState } from '../types.js';

/**
 * When the current turn started, for the footer (spec §5.6), or undefined
 * while idle. Unlike the loading indicator's timer, which starts over after
 * each approval, this one spans the whole turn, as the turn's token count
 * does. It changes only at turn boundaries: the ticking lives in
 * `useSecondsSince`, in the one cell that shows it.
 */
export function useTurnStartedAt(
  streamingState: StreamingState,
): number | undefined {
  const startRef = useRef<number | undefined>(undefined);
  if (streamingState === StreamingState.Idle) startRef.current = undefined;
  else if (startRef.current === undefined) startRef.current = Date.now();
  return startRef.current;
}

/** Whole seconds since `startedAt`, updated once a second. */
export function useSecondsSince(
  startedAt: number | undefined,
): number | undefined {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === undefined) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (startedAt === undefined) return undefined;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
