/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import {
  applyDynamicHeaderValues,
  hasDynamicPlaceholder,
  warnIfDynamicHeadersDisabled,
} from './outbound-dynamic-headers.js';

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function wrapFetchWithDynamicHeaders<TFetch>(
  baseFetch: TFetch,
  config: Config,
  customHeaders?: Record<string, string>,
): TFetch {
  const fetchLike = baseFetch as FetchLike;
  // Decided once, at client construction: whether this provider has any
  // `customHeaders` value carrying a runtime placeholder. When it does
  // not, each request passes straight through to the base fetch.
  const expandsHeaders = Object.values(customHeaders ?? {}).some(
    (value) => typeof value === 'string' && hasDynamicPlaceholder(value),
  );
  if (expandsHeaders) warnIfDynamicHeadersDisabled(customHeaders, config);
  const wrapped: FetchLike = async (input, init) => {
    if (!expandsHeaders) return fetchLike(input, init);

    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    applyDynamicHeaderValues(headers, config);
    return fetchLike(input, { ...init, headers });
  };

  return wrapped as TFetch;
}

export function buildOutboundFetch(
  runtimeFetch: unknown,
  config: Config,
  customHeaders?: Record<string, string>,
): typeof globalThis.fetch {
  const baseFetch =
    (runtimeFetch as typeof globalThis.fetch | undefined) ?? globalThis.fetch;
  return wrapFetchWithDynamicHeaders(baseFetch, config, customHeaders);
}
