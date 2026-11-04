/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import { createHash } from 'node:crypto';
import { GatewayConversationError } from './gateway-request.js';

export interface GatewayTransferQuestion {
  source: string;
  destination: string;
  signal?: AbortSignal;
}
type Confirmation = (question: GatewayTransferQuestion) => Promise<boolean>;
const confirmations = new WeakMap<Config, Confirmation>();

export function registerGatewayTransferConfirmation(
  config: Config,
  confirmation: Confirmation,
): () => void {
  confirmations.set(config, confirmation);
  return () => {
    if (confirmations.get(config) === confirmation)
      confirmations.delete(config);
  };
}

export async function confirmGatewayTransfer(
  config: Config,
  question: GatewayTransferQuestion,
): Promise<boolean> {
  if (question.signal?.aborted) return false;
  return (await confirmations.get(config)?.(question)) ?? false;
}

export interface GatewayTransferIntent {
  sessionId: string;
  sourceModel: string;
  destinationModel: string;
  sourceFingerprint: string;
  onConfirmed(): Promise<void>;
}
const intents = new WeakMap<Config, GatewayTransferIntent>();

export function gatewayTransferFingerprint(
  config: ContentGeneratorConfig,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        config.model,
        config.authType,
        config.apiKey,
        config.customHeaders,
        config.connection,
        config.reasoningRouteBaseUrl ?? config.baseUrl,
        config.reasoning,
        config.samplingParams,
        config.extra_body,
      ]),
    )
    .digest('hex');
}

export function stageGatewayTransfer(
  config: Config,
  intent: GatewayTransferIntent,
): void {
  intents.set(config, intent);
}

export function takeGatewayTransfer(
  config: Config,
): GatewayTransferIntent | undefined {
  const intent = intents.get(config);
  intents.delete(config);
  if (!intent) return undefined;
  if (intent.sessionId !== config.getSessionId()) return undefined;
  if (
    intent.sourceModel !== config.getModel() ||
    intent.sourceFingerprint !==
      gatewayTransferFingerprint(config.getContentGeneratorConfig())
  ) {
    throw new GatewayConversationError(
      'unsupported',
      'The conversation or model changed after transfer consent. Select the destination again to authorize the current transition.',
    );
  }
  return intent;
}

export function gatewayAccountRoute(
  id: string,
):
  | { kind: string; provider: string; account: string; native: string }
  | undefined {
  const match =
    /^o1gw\/(account|own)\/(claude|codex|copilot)\/([1-9]\d*)\/(.+)$/.exec(id);
  return match
    ? {
        kind: match[1],
        provider: match[2],
        account: match[3],
        native: match[4],
      }
    : undefined;
}

export function isGatewayAccountChange(
  source: string,
  destination: string,
): boolean {
  const left = gatewayAccountRoute(source);
  const right = gatewayAccountRoute(destination);
  if (source === destination) return false;
  if (!left || !right)
    return Boolean(
      left ||
        right ||
        source.startsWith('o1gw/group/') ||
        destination.startsWith('o1gw/group/'),
    );
  return Boolean(
    left &&
      right &&
      (left.kind !== right.kind ||
        left.provider !== right.provider ||
        left.account !== right.account),
  );
}

export function assertGatewayTransferCompatible(
  source: string,
  destination: string,
): void {
  const left = gatewayAccountRoute(source);
  const right = gatewayAccountRoute(destination);
  if (
    !left ||
    !right ||
    left.kind !== right.kind ||
    left.provider !== right.provider ||
    left.native !== right.native ||
    left.account === right.account
  ) {
    throw new GatewayConversationError(
      'unsupported',
      'Transfer requires two discovered accounts of the same provider, account type and native model. Start a new empty conversation for an incompatible selection.',
    );
  }
}

export async function prepareGatewayTransfer(
  fetcher: typeof globalThis.fetch,
  input: string | URL | Request,
  init: RequestInit,
  sourceModel?: string,
): Promise<RequestInit> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (
    url.pathname !== '/v1/messages' &&
    url.pathname !== '/v1/chat/completions'
  )
    throw new GatewayConversationError(
      'unsupported',
      'This route does not support conversation transfer.',
    );
  if (typeof init.body !== 'string')
    throw new GatewayConversationError(
      'unsupported',
      'The exact completion request is unavailable for transfer preparation.',
    );
  const request: unknown = JSON.parse(init.body);
  if (
    !request ||
    typeof request !== 'object' ||
    !('model' in request) ||
    typeof request.model !== 'string'
  )
    throw new GatewayConversationError(
      'unsupported',
      'Invalid transfer completion request.',
    );
  const headers = new Headers(init.headers);
  if (headers.has('x-o1gw-operation-id'))
    throw new GatewayConversationError(
      'unsupported',
      'Independent operations cannot inherit a conversation transfer.',
    );
  headers.delete('x-o1gw-conversation-transfer');
  headers.delete('content-length');
  const startedAt = Date.now();
  const response = await fetcher(new URL('/v1/conversations/transfer', url), {
    ...init,
    headers,
    body: JSON.stringify({
      model: request.model,
      ...(sourceModel ? { source_model: sourceModel } : {}),
      route: url.pathname,
      request,
      consent: true,
    }),
    redirect: 'error',
  });
  if (!response.ok) {
    const errorHeaders = new Headers();
    for (const name of [
      'retry-after',
      'x-o1gw-device-state',
      'x-o1gw-limit',
      'x-o1gw-limit-reset',
    ]) {
      const value = response.headers.get(name);
      if (value) errorHeaders.set(name, value);
    }
    const body: unknown = await response.json().catch(() => undefined);
    const error =
      body && typeof body === 'object' && 'error' in body
        ? body.error
        : undefined;
    const rawCode =
      error && typeof error === 'object'
        ? 'code' in error
          ? error.code
          : 'type' in error
            ? error.type
            : undefined
        : undefined;
    const providerCode =
      typeof rawCode === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(rawCode)
        ? rawCode
        : undefined;
    const retryAfter = errorHeaders.get('retry-after');
    throw new GatewayConversationError(
      'unavailable',
      `The gateway could not prepare this transfer (HTTP ${response.status}). The previous account remains selected.${retryAfter ? ` Retry-After: ${retryAfter}.` : ''}`,
      { status: response.status, headers: errorHeaders, providerCode },
    );
  }
  const prepared: unknown = await response.json();
  if (
    !prepared ||
    typeof prepared !== 'object' ||
    !('transfer_token' in prepared) ||
    typeof prepared.transfer_token !== 'string' ||
    prepared.transfer_token.length === 0 ||
    !('expires_in' in prepared) ||
    typeof prepared.expires_in !== 'number' ||
    !Number.isFinite(prepared.expires_in) ||
    prepared.expires_in <= 0 ||
    prepared.expires_in > 60 ||
    Date.now() >= startedAt + prepared.expires_in * 1000 ||
    init.signal?.aborted
  ) {
    throw new GatewayConversationError(
      'unavailable',
      'Transfer preparation expired or was not authorized. No completion was sent to the destination.',
    );
  }
  if (
    'destination_model' in prepared &&
    prepared.destination_model !== request.model
  )
    throw new GatewayConversationError(
      'unavailable',
      'The prepared destination does not match the selected account. No completion was sent.',
    );
  const destination = gatewayAccountRoute(request.model);
  if (
    destination?.kind === 'account' &&
    (!('destination_account_id' in prepared) ||
      String(prepared.destination_account_id) !== destination.account)
  )
    throw new GatewayConversationError(
      'unavailable',
      'The prepared account does not match the selected destination. No completion was sent.',
    );
  if (destination?.kind === 'own' && !('destination_model' in prepared))
    throw new GatewayConversationError(
      'unavailable',
      'The gateway did not confirm the prepared private destination. No completion was sent.',
    );
  headers.set('x-o1gw-conversation-transfer', prepared.transfer_token);
  return { ...init, headers, redirect: 'error' };
}
