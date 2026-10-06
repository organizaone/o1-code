/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type AttachmentPreparationState =
  | 'idle'
  | 'reading'
  | 'preparing'
  | 'error';

export function useAttachmentPreparation(
  onBusyChange?: (busy: boolean) => void,
) {
  const [state, setState] = useState<AttachmentPreparationState>('idle');
  const [notice, setNotice] = useState<'wait' | 'cancelled' | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const active = useRef<AbortController | null>(null);
  const notifyBusy = useRef(onBusyChange);
  notifyBusy.current = onBusyChange;

  const cancel = useCallback(() => {
    const operation = active.current;
    if (!operation) return false;
    active.current = null;
    operation.abort();
    notifyBusy.current?.(true);
    setState('idle');
    setNotice('cancelled');
    return true;
  }, []);

  const run = useCallback(
    async (
      task: (signal: AbortSignal, preparing: () => void) => Promise<void>,
    ) => {
      if (active.current) {
        setNotice('wait');
        return;
      }
      const operation = new AbortController();
      active.current = operation;
      notifyBusy.current?.(true);
      setNotice(null);
      setStartedAt(Date.now());
      setState('reading');
      let failed = false;
      try {
        await task(operation.signal, () => {
          if (!operation.signal.aborted) setState('preparing');
        });
        if (active.current === operation) {
          setState('idle');
          setNotice(null);
        }
      } catch {
        if (active.current === operation) {
          failed = true;
          setState('error');
          setNotice(null);
        }
      } finally {
        if (active.current === operation) {
          active.current = null;
          notifyBusy.current?.(failed);
        }
      }
    },
    [],
  );

  const blockSubmit = useCallback(() => {
    if (state === 'error') return true;
    if (!active.current) return false;
    setNotice('wait');
    return true;
  }, [state]);
  const dismiss = useCallback(() => {
    notifyBusy.current?.(false);
    setState('idle');
    setNotice(null);
  }, []);

  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
      notifyBusy.current?.(false);
    },
    [],
  );

  return { state, notice, startedAt, run, cancel, blockSubmit, dismiss };
}
