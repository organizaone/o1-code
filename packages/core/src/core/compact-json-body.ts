/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

type FetchLike = (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => Promise<Response>;

/**
 * Sends JSON request bodies without indentation. The Anthropic SDK serializes
 * every body with `JSON.stringify(body, null, 2)`; with deeply nested tool
 * schemas the indentation alone made requests nearly three times larger than
 * their content, and every byte counts against gateway limits and estimates.
 * A body that is not indented JSON passes through unchanged; the
 * `content-length` the SDK computed from the indented text is updated.
 */
export function withCompactJsonBody<F extends FetchLike>(fetchFn: F): F {
  const compacting: FetchLike = (input, init) => {
    const body = init?.body;
    // Compact JSON never holds a raw line break (one inside a string is
    // escaped), so its absence means there is nothing to remove.
    if (typeof body !== 'string' || !body.includes('\n')) {
      return fetchFn(input, init);
    }
    let compact: string;
    try {
      compact = JSON.stringify(JSON.parse(body));
    } catch {
      return fetchFn(input, init);
    }
    const headers = new Headers(init?.headers);
    if (headers.has('content-length')) {
      headers.set('content-length', String(Buffer.byteLength(compact)));
    }
    return fetchFn(input, { ...init, headers, body: compact });
  };
  return compacting as F;
}
