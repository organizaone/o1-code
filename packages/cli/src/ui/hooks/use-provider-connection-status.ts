/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useRef, useState } from 'react';
import type { ContentGeneratorConfig } from '@organizaone/o1-code-core/core/contentGenerator.js';
import { getDefaultBaseUrlForProtocol } from '@organizaone/o1-code-core/providers/provider-config.js';
import { AuthType } from '@organizaone/o1-code-core/utils/auth-type.js';
import { t } from '../../i18n/index.js';

export type ProviderConnectionStatus = 'checking' | 'online' | 'failed';

const CHECK_INTERVAL_MS = 30_000;
const CHECK_TIMEOUT_MS = 3_000;

export function getProviderConnectionBaseUrl(
  config:
    | Pick<ContentGeneratorConfig, 'authType' | 'baseUrl' | 'apiKey'>
    | undefined,
): string | undefined {
  if (!config) return undefined;
  if (config.baseUrl) return config.baseUrl;
  if (config.authType === AuthType.USE_VERTEX_AI) {
    const override = process.env['GOOGLE_VERTEX_BASE_URL'];
    if (override) return override;
    const location = process.env['GOOGLE_CLOUD_LOCATION'];
    if (config.apiKey || !location || location === 'global') {
      return 'https://aiplatform.googleapis.com';
    }
    if (location === 'us' || location === 'eu') {
      return `https://aiplatform.${location}.rep.googleapis.com`;
    }
    return `https://${location}-aiplatform.googleapis.com`;
  }
  if (config.authType === AuthType.USE_GEMINI) {
    const override = process.env['GOOGLE_GEMINI_BASE_URL'];
    if (override) return override;
  }
  return getDefaultBaseUrlForProtocol(config.authType) || undefined;
}

function connectionErrorReason(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth++) {
    const code = (current as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return t('DNS lookup failed');
    }
    if (code === 'ECONNREFUSED') return t('connection refused');
    if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
      return t('network unreachable');
    }
    if (code === 'ETIMEDOUT' || current.name === 'TimeoutError') {
      return t('connection timed out');
    }
    current = current.cause;
  }
  return t('connection failed');
}

/**
 * Where the check goes. A gateway has a public health route at its origin,
 * whatever path the base URL carries; `/models` is not a route there, so
 * probing it would log one unauthenticated request per check.
 */
export function getProviderConnectionCheckUrl(
  baseUrl: string,
  gateway: boolean,
): string {
  if (gateway) {
    try {
      return `${new URL(baseUrl).origin}/health`;
    } catch {
      // Not a URL: the request below fails and reports it.
    }
  }
  return `${baseUrl.replace(/\/+$/, '')}/models`;
}

interface CheckOutcome {
  reason?: string;
  /** A gateway answers 503 while it restarts or its tunnel reconnects. */
  mayBeRestarting?: boolean;
}

async function checkProvider(
  baseUrl: string,
  gateway: boolean,
  signal: AbortSignal,
): Promise<CheckOutcome> {
  try {
    const response = await fetch(
      getProviderConnectionCheckUrl(baseUrl, gateway),
      {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(CHECK_TIMEOUT_MS),
        ]),
      },
    );
    await response.body?.cancel();
    const { status } = response;
    return (status >= 300 && status < 400) || status === 407 || status >= 500
      ? {
          reason: t('provider returned HTTP {{status}}', {
            status: String(status),
          }),
          mayBeRestarting: gateway && status === 503,
        }
      : {};
  } catch (error) {
    return { reason: connectionErrorReason(error) };
  }
}

/**
 * Polls the selected provider without sending credentials or request content.
 * `gateway` says the provider is an o1-gateway, which is probed at its health
 * route and whose first 503 is held until the next check confirms it.
 */
export function useProviderConnectionStatus(
  baseUrl: string | undefined,
  onFailure: (reason: string) => void,
  gateway = false,
): ProviderConnectionStatus {
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;
  const [result, setResult] = useState<{
    baseUrl: string | undefined;
    status: ProviderConnectionStatus;
  }>({ baseUrl, status: 'checking' });

  useEffect(() => {
    if (!baseUrl) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous: ProviderConnectionStatus = 'checking';
    let heldRestart = false;

    const check = async () => {
      const { reason, mayBeRestarting } = await checkProvider(
        baseUrl,
        gateway,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      timer = setTimeout(() => void check(), CHECK_INTERVAL_MS);
      // One 503 from a gateway is most likely a deploy or a tunnel that is
      // reconnecting: the status stays as it was, and the failure is reported
      // only if the next check fails too.
      if (mayBeRestarting && !heldRestart && previous !== 'failed') {
        heldRestart = true;
        return;
      }
      heldRestart = false;
      const next: ProviderConnectionStatus = reason ? 'failed' : 'online';
      setResult({ baseUrl, status: next });
      if (reason && previous !== 'failed') onFailureRef.current(reason);
      previous = next;
    };

    void check();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [baseUrl, gateway]);

  if (!baseUrl) return 'failed';
  return result.baseUrl === baseUrl ? result.status : 'checking';
}
