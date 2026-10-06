/** Copyright 2026 o1-code contributors. SPDX-License-Identifier: Apache-2.0 */
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAttachmentPreparation } from './use-attachment-preparation.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useAttachmentPreparation', () => {
  it('blocks submission immediately and clears the waiting notice after completion', async () => {
    const task = deferred();
    const onActive = vi.fn();
    const { result } = renderHook(() => useAttachmentPreparation(onActive));
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.run(async (_signal, preparing) => {
        preparing();
        await task.promise;
      });
      expect(result.current.blockSubmit()).toBe(true);
    });
    expect(result.current.state).toBe('preparing');
    expect(result.current.notice).toBe('wait');
    expect(onActive).toHaveBeenLastCalledWith(true);
    await act(async () => {
      task.resolve();
      await operation;
    });
    expect(result.current.state).toBe('idle');
    expect(result.current.notice).toBeNull();
    expect(result.current.blockSubmit()).toBe(false);
    expect(onActive).toHaveBeenLastCalledWith(false);
  });

  it('cancels and isolates late completion from a newer operation', async () => {
    const first = deferred();
    const second = deferred();
    const { result } = renderHook(() => useAttachmentPreparation());
    let signal!: AbortSignal;
    let older!: Promise<void>;
    let newer!: Promise<void>;
    act(() => {
      older = result.current.run(async (value) => {
        signal = value;
        await first.promise;
      });
    });
    act(() => {
      expect(result.current.cancel()).toBe(true);
    });
    expect(signal.aborted).toBe(true);
    expect(result.current.notice).toBe('cancelled');
    act(() => {
      newer = result.current.run(async () => {
        await second.promise;
      });
    });
    await act(async () => {
      first.resolve();
      await older;
    });
    expect(result.current.state).toBe('reading');
    expect(result.current.blockSubmit()).toBe(true);
    await act(async () => {
      second.resolve();
      await newer;
    });
    expect(result.current.state).toBe('idle');
  });

  it('serializes preparation requests without starting a second task', async () => {
    const pending = deferred();
    const next = vi.fn();
    const { result } = renderHook(() => useAttachmentPreparation());
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.run(async () => pending.promise);
    });
    await act(async () => {
      await result.current.run(next);
    });
    expect(next).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve();
      await operation;
    });
  });

  it('holds an error until dismissal and permits retry', async () => {
    const onActive = vi.fn();
    const { result } = renderHook(() => useAttachmentPreparation(onActive));
    await act(async () => {
      await result.current.run(async () => {
        throw new Error('disk full');
      });
    });
    expect(result.current.state).toBe('error');
    expect(result.current.blockSubmit()).toBe(true);
    expect(onActive).toHaveBeenLastCalledWith(true);
    act(() => result.current.dismiss());
    expect(result.current.state).toBe('idle');
    expect(onActive).toHaveBeenLastCalledWith(false);
    await act(async () => {
      await result.current.run(async () => {});
    });
    expect(result.current.state).toBe('idle');
  });

  it('aborts pending work when the input unmounts', async () => {
    const pending = deferred();
    let signal!: AbortSignal;
    const onActive = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAttachmentPreparation(onActive),
    );
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.run(async (value) => {
        signal = value;
        await pending.promise;
      });
    });
    unmount();
    expect(signal.aborted).toBe(true);
    expect(onActive).toHaveBeenLastCalledWith(false);
    pending.resolve();
    await operation;
  });
});
