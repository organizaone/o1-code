/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import {
  buildOutboundFetch,
  wrapFetchWithDynamicHeaders,
} from './outbound-fetch.js';

function config(sessionId = 'session-1'): Config {
  return {
    getSessionId: vi.fn().mockReturnValue(sessionId),
    getOutboundAllowDynamicHeaderValues: vi.fn().mockReturnValue(true),
  } as unknown as Config;
}

const dynamicHeaders = { 'x-session': '${session_id}' };

describe('outbound fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    'https://api.acme.example.com/v1',
    'https://api.openai.com/v1',
    'not a URL',
  ])('passes %s through untouched without dynamic headers', async (url) => {
    const baseFetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(),
    );
    const wrappedFetch = wrapFetchWithDynamicHeaders(baseFetch, config());

    await wrappedFetch(url, {
      headers: { 'X-Existing': 'value' },
    });

    expect(baseFetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ headers: { 'X-Existing': 'value' } }),
    );
  });

  it('does not add a session_id header on its own', async () => {
    const baseFetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(),
    );
    const wrappedFetch = wrapFetchWithDynamicHeaders(
      baseFetch,
      config(),
      dynamicHeaders,
    );

    await wrappedFetch('https://api.acme.example.com/v1', {
      headers: dynamicHeaders,
    });

    const headers = new Headers(baseFetch.mock.calls[0][1]?.headers);
    expect(headers.get('x-session')).toBe('session-1');
    expect(headers.has('session_id')).toBe(false);
  });

  it('preserves headers carried by a Request object', async () => {
    const baseFetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(),
    );
    const wrappedFetch = wrapFetchWithDynamicHeaders(
      baseFetch,
      config(),
      dynamicHeaders,
    );

    await wrappedFetch(
      new Request('https://api.acme.example.com/v1', {
        headers: { Authorization: 'Bearer token', ...dynamicHeaders },
      }),
    );

    const headers = new Headers(baseFetch.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(headers.get('x-session')).toBe('session-1');
  });

  it('merges Request and init headers before expanding', async () => {
    const baseFetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(),
    );
    const wrappedFetch = wrapFetchWithDynamicHeaders(
      baseFetch,
      config(),
      dynamicHeaders,
    );

    await wrappedFetch(
      new Request('https://api.acme.example.com/v1', {
        headers: {
          Authorization: 'Bearer token',
          'X-Shared': 'request',
        },
      }),
      {
        headers: { 'X-Extra': 'value', 'X-Shared': 'init', ...dynamicHeaders },
      },
    );

    const headers = new Headers(baseFetch.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(headers.get('x-extra')).toBe('value');
    expect(headers.get('x-shared')).toBe('init');
    expect(headers.get('x-session')).toBe('session-1');
  });

  it('wraps a supplied runtime fetch', async () => {
    const runtimeFetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(),
    );
    const outboundFetch = buildOutboundFetch(
      runtimeFetch,
      config(),
      dynamicHeaders,
    );

    await outboundFetch('https://api.acme.example.com/v1', {
      headers: dynamicHeaders,
    });

    const headers = new Headers(runtimeFetch.mock.calls[0][1]?.headers);
    expect(headers.get('x-session')).toBe('session-1');
  });

  it('falls back to globalThis.fetch when no runtime fetch exists', async () => {
    const fetchStub = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(),
    );
    vi.stubGlobal('fetch', fetchStub);
    const outboundFetch = buildOutboundFetch(undefined, config());

    await outboundFetch('https://api.acme.example.com/v1');

    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.acme.example.com/v1',
      undefined,
    );
  });
});
