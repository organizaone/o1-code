/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

const TIMER_REFRESH_INTERVAL_MS = 500;

/**
 * A wall-clock timer as data: the time already counted, and when the running
 * segment started (`performance.now()`), or null while stopped. It changes
 * only when the timer starts, pauses, resumes or resets, never as time
 * passes, so the component holding it does not redraw every tick.
 */
export interface ElapsedClock {
  readonly accumulatedMs: number;
  readonly runningSinceMs: number | null;
}

export const STOPPED_CLOCK: ElapsedClock = {
  accumulatedMs: 0,
  runningSinceMs: null,
};

function elapsedSeconds(elapsedMs: number): number {
  return Number((Math.max(0, elapsedMs) / 1000).toFixed(1));
}

/** The clock's reading at `nowMs`, in seconds to one decimal. */
export function elapsedSecondsAt(
  clock: ElapsedClock,
  nowMs: number = performance.now(),
): number {
  const running =
    clock.runningSinceMs === null
      ? 0
      : Math.max(0, nowMs - clock.runningSinceMs);
  return elapsedSeconds(clock.accumulatedMs + running);
}

/**
 * The timer's state, for whoever shows it to read with `useElapsedSeconds`.
 * @param isActive Whether the timer should be running.
 * @param resetKey A key that, when changed, will reset the timer to 0.
 * @param isPaused Whether the timer should pause without resetting.
 */
export function useTimerClock(
  isActive: boolean,
  resetKey: unknown,
  isPaused = false,
): ElapsedClock {
  const [clock, setClock] = useState<ElapsedClock>(STOPPED_CLOCK);
  const clockRef = useRef<ElapsedClock>(STOPPED_CLOCK);
  const prevResetKeyRef = useRef(resetKey);
  const prevIsActiveRef = useRef(isActive);

  useEffect(() => {
    let next = clockRef.current;

    if (
      prevResetKeyRef.current !== resetKey ||
      (!prevIsActiveRef.current && isActive)
    ) {
      next = STOPPED_CLOCK;
      prevResetKeyRef.current = resetKey;
    }

    if (!isActive || isPaused) {
      // Stop: fold the running segment into the time already counted.
      if (next.runningSinceMs !== null) {
        next = {
          accumulatedMs:
            next.accumulatedMs +
            Math.max(0, performance.now() - next.runningSinceMs),
          runningSinceMs: null,
        };
      }
    } else if (next.runningSinceMs === null) {
      next = { ...next, runningSinceMs: performance.now() };
    }

    prevIsActiveRef.current = isActive;
    if (next !== clockRef.current) {
      clockRef.current = next;
      setClock(next);
    }
  }, [isActive, isPaused, resetKey]);

  return clock;
}

/** The clock's reading in seconds, refreshed while it runs. */
export function useElapsedSeconds(clock: ElapsedClock | undefined): number {
  const [nowMs, setNowMs] = useState(() => performance.now());
  const running = clock?.runningSinceMs ?? null;

  useEffect(() => {
    if (running === null) return;
    setNowMs(performance.now());
    const interval = setInterval(
      () => setNowMs(performance.now()),
      TIMER_REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [running]);

  return clock ? elapsedSecondsAt(clock, nowMs) : 0;
}

/**
 * Custom hook to manage a wall-clock timer.
 * @param isActive Whether the timer should be running.
 * @param resetKey A key that, when changed, will reset the timer to 0 and restart the interval.
 * @param isPaused Whether the timer should pause without resetting elapsed time.
 * @returns The elapsed time in seconds.
 */
export const useTimer = (
  isActive: boolean,
  resetKey: unknown,
  isPaused = false,
) => useElapsedSeconds(useTimerClock(isActive, resetKey, isPaused));
