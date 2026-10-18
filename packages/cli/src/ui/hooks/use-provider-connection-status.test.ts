/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthType } from '@organizaone/o1-code-core/utils/auth-type.js';
import {
  getProviderConnectionBaseUrl,
  useProviderConnectionStatus,
} from './use-provider-connection-status.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('useProviderConnectionStatus', () => {
  it('uses the selected Vertex AI regional endpoint when no base URL is configured', () => {
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'us-central1');
    expect(
      getProviderConnectionBaseUrl({ authType: AuthType.USE_VERTEX_AI }),
    ).toBe('https://us-central1-aiplatform.googleapis.com');
  });

  it('uses the Vertex AI global and multi-regional endpoints when selected', () => {
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'eu');
    expect(
      getProviderConnectionBaseUrl({ authType: AuthType.USE_VERTEX_AI }),
    ).toBe('https://aiplatform.eu.rep.googleapis.com');
    expect(
      getProviderConnectionBaseUrl({
        authType: AuthType.USE_VERTEX_AI,
        apiKey: 'test-key',
      }),
    ).toBe('https://aiplatform.googleapis.com');
  });

  it('uses the global Vertex endpoint when no location is configured', () => {
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
    expect(
      getProviderConnectionBaseUrl({ authType: AuthType.USE_VERTEX_AI }),
    ).toBe('https://aiplatform.googleapis.com');
  });

  it('honors the SDK endpoint overrides when no base URL is configured', () => {
    vi.stubEnv('GOOGLE_VERTEX_BASE_URL', 'http://vertex.example/v1');
    vi.stubEnv('GOOGLE_GEMINI_BASE_URL', 'http://gemini.example/v1');
    expect(
      getProviderConnectionBaseUrl({ authType: AuthType.USE_VERTEX_AI }),
    ).toBe('http://vertex.example/v1');
    expect(
      getProviderConnectionBaseUrl({ authType: AuthType.USE_GEMINI }),
    ).toBe('http://gemini.example/v1');
  });

  it.each([302, 407])(
    'reports HTTP %i as a connection failure',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );
      const onFailure = vi.fn();
      const { result, unmount } = renderHook(() =>
        useProviderConnectionStatus('https://provider.example/v1', onFailure),
      );

      await act(async () => {});
      expect(result.current).toBe('failed');
      expect(onFailure).toHaveBeenCalledWith(
        `provider returned HTTP ${status}`,
      );
      unmount();
    },
  );

  it('reports a failure once per outage and recovers on the next reachable response', async () => {
    vi.useFakeTimers();
    const networkError = () =>
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('unreachable'), {
          code: 'ENETUNREACH',
        }),
      });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(networkError());
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() =>
      useProviderConnectionStatus('https://provider.example/v1', onFailure),
    );

    expect(result.current).toBe('checking');
    await act(async () => {});
    expect(result.current).toBe('failed');
    expect(onFailure).toHaveBeenCalledOnce();

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current).toBe('failed');
    expect(onFailure).toHaveBeenCalledOnce();

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current).toBe('online');

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current).toBe('failed');
    expect(onFailure).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('does not start another check while one is still pending', async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() =>
      useProviderConnectionStatus('http://localhost:11434/v1', vi.fn()),
    );

    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => finish(new Response(null, { status: 404 })));
    expect(result.current).toBe('online');
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('ignores an old provider response after the selected URL changes', async () => {
    let finishOld!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ url }) => useProviderConnectionStatus(url, onFailure),
      { initialProps: { url: 'https://old.example/v1' } },
    );

    rerender({ url: 'https://new.example/v1' });
    expect(result.current).toBe('checking');
    await act(async () => {});
    expect(result.current).toBe('failed');
    await act(async () => finishOld(new Response(null, { status: 200 })));
    expect(result.current).toBe('failed');
    expect(onFailure).toHaveBeenCalledOnce();
    unmount();
  });

  it('does not repeat a warning when its callback changes during an outage', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const firstWarning = vi.fn();
    const nextWarning = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onFailure }) =>
        useProviderConnectionStatus('https://provider.example/v1', onFailure),
      { initialProps: { onFailure: firstWarning } },
    );

    await act(async () => {});
    expect(firstWarning).toHaveBeenCalledOnce();
    rerender({ onFailure: nextWarning });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(nextWarning).not.toHaveBeenCalled();
    unmount();
  });

  it('cancels the credential-free provider check when the footer closes', () => {
    let signal!: AbortSignal;
    let requestUrl = '';
    let requestMethod = '';
    let requestHeaders: HeadersInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options: RequestInit) => {
        requestUrl = url;
        requestMethod = options.method ?? '';
        requestHeaders = options.headers;
        signal = options.signal as AbortSignal;
        return new Promise<Response>(() => {});
      }),
    );
    const { unmount } = renderHook(() =>
      useProviderConnectionStatus('https://provider.example/v1', vi.fn()),
    );

    expect(requestUrl).toBe('https://provider.example/v1/models');
    expect(requestMethod).toBe('HEAD');
    expect(requestHeaders).toBeUndefined();
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
