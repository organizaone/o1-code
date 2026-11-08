/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { withCompactJsonBody } from './compact-json-body.js';

const ok = (
  _input: Parameters<typeof fetch>[0],
  _init?: Parameters<typeof fetch>[1],
) => Promise.resolve(new Response('{}'));

describe('withCompactJsonBody', () => {
  it('removes indentation and updates the content length', async () => {
    const inner = vi.fn(ok);
    const payload = {
      model: 'm',
      tools: [
        { name: 't', input_schema: { properties: { a: { type: 'string' } } } },
      ],
      messages: [{ role: 'user', content: 'line one\nline two — é' }],
    };
    const indented = JSON.stringify(payload, null, 2);

    await withCompactJsonBody(inner)('https://example.test/v1/messages', {
      method: 'POST',
      body: indented,
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(indented)),
        authorization: 'Bearer test',
      },
    });

    const [, init] = inner.mock.calls[0]!;
    const compact = JSON.stringify(payload);
    expect(init?.body).toBe(compact);
    const headers = new Headers(init?.headers);
    expect(headers.get('content-length')).toBe(
      String(Buffer.byteLength(compact)),
    );
    expect(headers.get('authorization')).toBe('Bearer test');
    expect(JSON.parse(init?.body as string)).toEqual(payload);
  });

  it('passes compact, non-JSON and non-string bodies through unchanged', async () => {
    const inner = vi.fn(ok);
    const wrapped = withCompactJsonBody(inner);
    const compactInit = { body: '{"a":"x\\ny"}', headers: { 'x-k': 'v' } };
    const textInit = { body: 'not json\nat all' };
    const bytesInit = { body: new Uint8Array([1, 2]) };

    await wrapped('https://example.test', compactInit);
    await wrapped('https://example.test', textInit);
    await wrapped('https://example.test', bytesInit);
    await wrapped('https://example.test');

    expect(inner.mock.calls.map(([, init]) => init)).toEqual([
      compactInit,
      textInit,
      bytesInit,
      undefined,
    ]);
  });
});
