/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  LMSTUDIO_BASE_URL,
  OLLAMA_BASE_URL,
  probeLocalServers,
  probeOpenAiServer,
} from './local-servers.js';

type FetchFn = typeof globalThis.fetch;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A fetch that answers by URL and records what it was asked. */
function fakeFetch(routes: Record<string, () => Promise<Response>>) {
  return vi.fn<FetchFn>(async (input) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new TypeError(`fetch failed: ECONNREFUSED ${url}`);
    return route();
  });
}

const OLLAMA_TAGS = 'http://127.0.0.1:11434/api/tags';
const LMSTUDIO_MODELS = 'http://127.0.0.1:1234/api/v0/models';

describe('probeLocalServers', () => {
  it('finds both servers running with their models', async () => {
    const fetch = fakeFetch({
      [OLLAMA_TAGS]: async () =>
        json({ models: [{ name: 'llama3.2:3b' }, { name: 'qwen3:8b' }] }),
      [LMSTUDIO_MODELS]: async () =>
        json({ object: 'list', data: [{ id: 'google/gemma-3-12b' }] }),
    });

    const result = await probeLocalServers({ fetch });

    expect(result).toEqual([
      {
        id: 'ollama',
        baseUrl: OLLAMA_BASE_URL,
        running: true,
        models: ['llama3.2:3b', 'qwen3:8b'],
      },
      {
        id: 'lmstudio',
        baseUrl: LMSTUDIO_BASE_URL,
        running: true,
        models: ['google/gemma-3-12b'],
      },
    ]);
    expect(OLLAMA_BASE_URL).toBe('http://127.0.0.1:11434/v1');
    expect(LMSTUDIO_BASE_URL).toBe('http://127.0.0.1:1234/v1');
  });

  it('reports a server that refuses the connection as not running', async () => {
    const fetch = fakeFetch({
      [OLLAMA_TAGS]: async () => json({ models: [] }),
    });

    const result = await probeLocalServers({ fetch });

    expect(result).toEqual([
      { id: 'ollama', baseUrl: OLLAMA_BASE_URL, running: true, models: [] },
      {
        id: 'lmstudio',
        baseUrl: LMSTUDIO_BASE_URL,
        running: false,
        models: [],
      },
    ]);
  });

  it('reports a server that answers with the wrong shape as not running', async () => {
    const fetch = fakeFetch({
      // An OpenAI-shaped answer on Ollama's port is some other server.
      [OLLAMA_TAGS]: async () => json({ data: [{ id: 'x' }] }),
      [LMSTUDIO_MODELS]: async () => new Response('<html>hi</html>'),
    });

    const result = await probeLocalServers({ fetch });

    expect(result.map((probe) => [probe.id, probe.running])).toEqual([
      ['ollama', false],
      ['lmstudio', false],
    ]);
    expect(result.every((probe) => probe.models.length === 0)).toBe(true);
  });

  it('reports a non-2xx answer as not running', async () => {
    const fetch = fakeFetch({
      [OLLAMA_TAGS]: async () => json({ models: [] }, 500),
      [LMSTUDIO_MODELS]: async () => json({ data: [] }, 404),
    });

    const result = await probeLocalServers({ fetch });

    expect(result.every((probe) => !probe.running)).toBe(true);
  });

  it('gives up on a server that does not answer in time', async () => {
    const never: FetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });

    const started = Date.now();
    const result = await probeLocalServers({
      fetch: vi.fn(never),
      timeoutMs: 20,
    });

    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.every((probe) => !probe.running)).toBe(true);
  });

  it('probes both servers in parallel', async () => {
    const asked: string[] = [];
    const pending: Array<() => void> = [];
    const fetch = vi.fn<FetchFn>(
      (input) =>
        new Promise((resolve) => {
          asked.push(String(input));
          pending.push(() => resolve(json({ models: [], data: [] })));
        }),
    );

    const probing = probeLocalServers({ fetch });
    await Promise.resolve();
    expect(asked).toEqual([OLLAMA_TAGS, LMSTUDIO_MODELS]);
    pending.forEach((release) => release());
    await probing;
  });

  it('stops when the caller aborts', async () => {
    const controller = new AbortController();
    const never: FetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });

    const probing = probeLocalServers({
      fetch: vi.fn(never),
      signal: controller.signal,
      timeoutMs: 60_000,
    });
    controller.abort();

    const result = await probing;
    expect(result.every((probe) => !probe.running)).toBe(true);
  });
});

describe('probeOpenAiServer', () => {
  it('lists the models of an OpenAI-compatible server', async () => {
    const fetch = fakeFetch({
      'http://127.0.0.1:8080/v1/models': async () =>
        json({ object: 'list', data: [{ id: 'local-a' }, { id: 'local-b' }] }),
    });

    await expect(
      probeOpenAiServer('http://127.0.0.1:8080/v1/', { fetch }),
    ).resolves.toEqual({
      baseUrl: 'http://127.0.0.1:8080/v1',
      running: true,
      models: ['local-a', 'local-b'],
    });
  });

  it('reports a server without the OpenAI shape as not running', async () => {
    const fetch = fakeFetch({
      'http://127.0.0.1:8080/v1/models': async () => json({ models: [] }),
    });

    await expect(
      probeOpenAiServer('http://127.0.0.1:8080/v1', { fetch }),
    ).resolves.toEqual({
      baseUrl: 'http://127.0.0.1:8080/v1',
      running: false,
      models: [],
    });
  });

  it('never throws on a URL it cannot parse', async () => {
    await expect(
      probeOpenAiServer('not a url', { fetch: fakeFetch({}) }),
    ).resolves.toMatchObject({ running: false, models: [] });
  });
});
