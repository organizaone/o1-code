/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */
// @vitest-environment jsdom

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthType } from '@organizaone/o1-code-core/utils/auth-type.js';
import {
  getProviderConnectionBaseUrl,
  getProviderConnectionCheckUrl,
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

  it.each([
    ['https://api.organizaone.com', 'https://api.organizaone.com/health'],
    ['https://api.organizaone.com/', 'https://api.organizaone.com/health'],
    ['https://api.organizaone.com/v1', 'https://api.organizaone.com/health'],
    ['https://api.organizaone.com/v1/', 'https://api.organizaone.com/health'],
    ['http://127.0.0.1:4242/v1', 'http://127.0.0.1:4242/health'],
    [
      'https://gateway.example:8443/proxy/v1',
      'https://gateway.example:8443/health',
    ],
  ])('checks a gateway at %s through its health route', (baseUrl, expected) => {
    expect(getProviderConnectionCheckUrl(baseUrl, true)).toBe(expected);
  });

  it.each([
    ['https://provider.example/v1', 'https://provider.example/v1/models'],
    ['https://provider.example/v1/', 'https://provider.example/v1/models'],
    ['https://api.organizaone.com', 'https://api.organizaone.com/models'],
  ])(
    'checks any other provider at %s through its models route',
    (baseUrl, expected) => {
      expect(getProviderConnectionCheckUrl(baseUrl, false)).toBe(expected);
    },
  );

  it('sends a gateway only a credential-free HEAD to its health route', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() =>
      useProviderConnectionStatus(
        'https://api.organizaone.com/v1',
        onFailure,
        true,
      ),
    );

    await act(async () => {});
    expect(result.current).toBe('online');
    expect(onFailure).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.organizaone.com/health',
    ]);
    const options = fetchMock.mock.calls[0]![1];
    expect(options.method).toBe('HEAD');
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeUndefined();
    unmount();
  });

  it('holds the first 503 of a gateway and reports the second', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() =>
      useProviderConnectionStatus(
        'https://api.organizaone.com',
        onFailure,
        true,
      ),
    );

    await act(async () => {});
    expect(result.current).toBe('online');

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current).toBe('online');
    expect(onFailure).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current).toBe('failed');
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(
      'provider returned HTTP 503',
    );

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current).toBe('failed');
    expect(onFailure).toHaveBeenCalledOnce();
    unmount();
  });

  it('stays online when a gateway answers again after one 503', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() =>
      useProviderConnectionStatus(
        'https://api.organizaone.com',
        onFailure,
        true,
      ),
    );

    await act(async () => {});
    // A restart, the recovery, and then the first 503 of another restart.
    for (let check = 0; check < 3; check++) {
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(result.current).toBe('online');
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onFailure).not.toHaveBeenCalled();
    unmount();
  });

  it('reports at once what is not a restart: a gateway that cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
        }),
      ),
    );
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() =>
      useProviderConnectionStatus(
        'https://api.organizaone.com',
        onFailure,
        true,
      ),
    );

    await act(async () => {});
    expect(result.current).toBe('failed');
    expect(onFailure).toHaveBeenCalledExactlyOnceWith('connection refused');
    unmount();
  });

  it('reports the first 503 of a provider that is not a gateway', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() =>
      useProviderConnectionStatus('https://provider.example/v1', onFailure),
    );

    await act(async () => {});
    expect(result.current).toBe('failed');
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(
      'provider returned HTTP 503',
    );
    unmount();
  });

  it('reports a 502 from a gateway at once', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 502 })),
    );
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() =>
      useProviderConnectionStatus(
        'https://api.organizaone.com',
        onFailure,
        true,
      ),
    );

    await act(async () => {});
    expect(result.current).toBe('failed');
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(
      'provider returned HTTP 502',
    );
    unmount();
  });

  describe('through the tunnel local endpoint', () => {
    let server: Server | undefined;
    const requests: Array<{
      method: string | undefined;
      url: string | undefined;
      headers: IncomingHttpHeaders;
      body: string;
    }> = [];

    async function listen(status: number): Promise<string> {
      requests.length = 0;
      server = createServer((request, response) => {
        let body = '';
        request.on('data', (chunk) => (body += String(chunk)));
        request.on('end', () => {
          requests.push({
            method: request.method,
            url: request.url,
            headers: request.headers,
            body,
          });
          response.writeHead(status).end();
        });
      });
      await new Promise<void>((resolve) =>
        server!.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Missing local endpoint address');
      }
      return `http://127.0.0.1:${address.port}`;
    }

    afterEach(async () => {
      const closing = server;
      server = undefined;
      if (closing) {
        closing.closeAllConnections();
        await new Promise<void>((resolve) => closing.close(() => resolve()));
      }
    });

    it.each(['', '/v1'])(
      'sends base URL path "%s" a bare HEAD to the health route',
      async (basePath) => {
        const origin = await listen(200);
        const onFailure = vi.fn();
        const { result, unmount } = renderHook(() =>
          useProviderConnectionStatus(`${origin}${basePath}`, onFailure, true),
        );

        await waitFor(() => expect(result.current).toBe('online'));
        expect(onFailure).not.toHaveBeenCalled();
        expect(requests).toHaveLength(1);
        const [request] = requests;
        expect(request!.method).toBe('HEAD');
        expect(request!.url).toBe('/health');
        expect(request!.body).toBe('');
        // The local endpoint refuses what only a browser sends, and no key
        // or token may leave with a check.
        expect(
          Object.keys(request!.headers).filter(
            (name) =>
              name === 'sec-fetch-site' ||
              name === 'sec-fetch-dest' ||
              name === 'origin' ||
              name === 'authorization' ||
              name === 'x-api-key',
          ),
        ).toEqual([]);
        unmount();
      },
    );

    it('reports a blocked tunnel at once', async () => {
      const origin = await listen(502);
      const onFailure = vi.fn();
      const { result, unmount } = renderHook(() =>
        useProviderConnectionStatus(origin, onFailure, true),
      );

      await waitFor(() => expect(result.current).toBe('failed'));
      expect(onFailure).toHaveBeenCalledExactlyOnceWith(
        'provider returned HTTP 502',
      );
      unmount();
    });

    it('holds the first 503 of a reconnecting tunnel', async () => {
      const origin = await listen(503);
      const onFailure = vi.fn();
      const { result, unmount } = renderHook(() =>
        useProviderConnectionStatus(origin, onFailure, true),
      );

      await waitFor(() => expect(requests).toHaveLength(1));
      await act(async () => {});
      expect(result.current).toBe('checking');
      expect(onFailure).not.toHaveBeenCalled();
      unmount();
    });

    it('reports a local endpoint that is not listening', async () => {
      const origin = await listen(200);
      const closing = server!;
      server = undefined;
      await new Promise<void>((resolve) => closing.close(() => resolve()));
      const onFailure = vi.fn();
      const { result, unmount } = renderHook(() =>
        useProviderConnectionStatus(origin, onFailure, true),
      );

      await waitFor(() => expect(result.current).toBe('failed'));
      expect(onFailure).toHaveBeenCalledExactlyOnceWith('connection refused');
      unmount();
    });
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
