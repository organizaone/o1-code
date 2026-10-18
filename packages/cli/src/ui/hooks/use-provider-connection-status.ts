/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
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

async function checkProvider(
  baseUrl: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(CHECK_TIMEOUT_MS)]),
    });
    await response.body?.cancel();
    return (response.status >= 300 && response.status < 400) ||
      response.status === 407 ||
      response.status >= 500
      ? t('provider returned HTTP {{status}}', {
          status: String(response.status),
        })
      : undefined;
  } catch (error) {
    return connectionErrorReason(error);
  }
}

/** Polls the selected provider without sending credentials or request content. */
export function useProviderConnectionStatus(
  baseUrl: string | undefined,
  onFailure: (reason: string) => void,
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

    const check = async () => {
      const reason = await checkProvider(baseUrl, controller.signal);
      if (controller.signal.aborted) return;
      const next: ProviderConnectionStatus = reason ? 'failed' : 'online';
      setResult({ baseUrl, status: next });
      if (reason && previous !== 'failed') onFailureRef.current(reason);
      previous = next;
      timer = setTimeout(() => void check(), CHECK_INTERVAL_MS);
    };

    void check();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [baseUrl]);

  if (!baseUrl) return 'failed';
  return result.baseUrl === baseUrl ? result.status : 'checking';
}
