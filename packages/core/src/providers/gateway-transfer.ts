/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import type { Content } from '@google/genai';
import type { AuthType } from '../utils/auth-type.js';
import type { GatewayConversationRecordPayload } from '../services/chatRecordingService.js';
import { createHash } from 'node:crypto';
import { reachesOrganizaOne } from './presets/organizaone.js';
import { gatewayFailure } from './gateway-errors.js';
import {
  GatewayConversationError,
  normalizeGatewayEndpoint,
  isGatewayConversationActive,
} from './gateway-request.js';

export interface GatewayTransferQuestion {
  source: string;
  destination: string;
  purpose?: 'group-transfer';
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

export interface GatewayAccountSelection {
  sessionId: string;
  sourceModel: string;
  destinationModel: string;
  destinationFingerprint: string;
}
const selections = new WeakMap<Config, GatewayAccountSelection>();
const selectionsInProgress = new WeakMap<Config, { sessionId: string }>();

export function isGatewayAccountSelectionInProgress(config: Config): boolean {
  const selection = selectionsInProgress.get(config);
  return (
    selection !== undefined && selection.sessionId === config.getSessionId()
  );
}

function accountSelectionFingerprint(config: ContentGeneratorConfig): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        config.model,
        config.authType,
        config.apiKey,
        config.customHeaders,
        config.connection,
        normalizeGatewayEndpoint(
          config.reasoningRouteBaseUrl ?? config.baseUrl ?? '',
        ),
      ]),
    )
    .digest('hex');
}

export function recordGatewayAccountSelection(
  config: Config,
  sourceModel: string,
  destinationModel: string,
): void {
  const destination = config.getContentGeneratorConfig();
  if (destination.model !== destinationModel)
    throw new GatewayConversationError(
      'unsupported',
      'The selected account changed before authorization could be recorded. Select the destination again.',
    );
  selections.set(config, {
    sessionId: config.getSessionId(),
    sourceModel,
    destinationModel,
    destinationFingerprint: accountSelectionFingerprint(destination),
  });
}

export function getGatewayAccountSelection(
  config: Config,
): GatewayAccountSelection | undefined {
  const selection = selections.get(config);
  if (
    !selection ||
    selection.sessionId !== config.getSessionId() ||
    selection.destinationFingerprint !==
      accountSelectionFingerprint(config.getContentGeneratorConfig())
  )
    return undefined;
  return selection;
}

export function hasPendingGatewayTools(contents: readonly Content[]): boolean {
  const pending: Array<{ id?: string; name?: string }> = [];
  for (const content of contents) {
    for (const part of content.parts ?? []) {
      if (part.functionCall) {
        pending.push(part.functionCall);
      } else if (part.functionResponse) {
        const response = part.functionResponse;
        const index = pending.findIndex((call) =>
          response.id
            ? call.id === response.id
            : !call.id && call.name === response.name,
        );
        if (index >= 0) pending.splice(index, 1);
      }
    }
  }
  return pending.length > 0;
}

export interface GatewayAccountSelectionTarget {
  model: string;
  authType?: AuthType;
  baseUrl?: string;
  label?: string;
}

export async function switchWithGatewayAccountSelection(
  config: Config,
  target: GatewayAccountSelectionTarget,
  switchModel: () => Promise<void>,
  options: {
    signal?: AbortSignal;
    isBusy?: () => boolean;
    confirm?: Confirmation;
  } = {},
): Promise<boolean> {
  if (isGatewayAccountSelectionInProgress(config))
    throw new GatewayConversationError(
      'busy',
      "Finish or cancel the current response and pending tools before changing this conversation's model or account.",
    );
  const before = config.getContentGeneratorConfig?.();
  if (
    !before ||
    (!reachesOrganizaOne(before) && !target.model.startsWith('o1gw/'))
  ) {
    await switchModel();
    return true;
  }
  const history = () => {
    const client = config.getLlmClient();
    return client.isInitialized?.() === false ? [] : client.getHistoryShallow();
  };
  const ensureIdle = () => {
    if (options.signal?.aborted)
      throw new GatewayConversationError(
        'cancelled',
        'Account selection was cancelled.',
      );
    if (
      isGatewayAccountSelectionInProgress(config) ||
      isGatewayConversationActive(config, config.getSessionId()) ||
      options.isBusy?.() ||
      hasPendingGatewayTools(history())
    )
      throw new GatewayConversationError(
        'busy',
        "Finish or cancel the current response and pending tools before changing this conversation's model or account.",
      );
  };
  ensureIdle();
  const sessionId = config.getSessionId();
  let sourceModel = before.model;
  if (target.model === before.model) {
    const endpoint = normalizeGatewayEndpoint(
      before.reasoningRouteBaseUrl ?? before.baseUrl ?? '',
    );
    const resumed =
      config.getResumedSessionData?.()?.conversation.messages ?? [];
    for (const row of [...resumed].reverse()) {
      if (
        row.subtype !== 'gateway_conversation' ||
        row.forkedFrom ||
        row.sessionId !== sessionId
      )
        continue;
      const record = row.systemPayload as
        | GatewayConversationRecordPayload
        | undefined;
      if (
        record?.actor === 'main' &&
        record.conversationId === sessionId &&
        normalizeGatewayEndpoint(record.endpoint) === endpoint
      ) {
        sourceModel = record.model;
        break;
      }
    }
  }
  const sourceFingerprint = gatewayTransferFingerprint(before);
  const routeChanged =
    (target.authType !== undefined && target.authType !== before.authType) ||
    normalizeGatewayEndpoint(
      target.baseUrl ?? before.reasoningRouteBaseUrl ?? before.baseUrl ?? '',
    ) !==
      normalizeGatewayEndpoint(
        before.reasoningRouteBaseUrl ?? before.baseUrl ?? '',
      );
  // Gateway conversation contract v2 (o1-gateway 11.9.0): switching model or
  // account within the same gateway needs no consent; the gateway rebuilds
  // from the supplied history when the native session cannot continue. Sending
  // the history to another gateway or provider route still asks first.
  const requiresConsent = routeChanged && history().length > 0;
  if (requiresConsent) {
    const question = {
      source: sourceModel,
      destination: target.label ?? target.model,
      signal: options.signal,
    };
    const confirmed = await (options.confirm
      ? options.confirm(question)
      : confirmGatewayTransfer(config, question));
    if (!confirmed) return false;
  }
  if (
    sessionId !== config.getSessionId() ||
    sourceFingerprint !==
      gatewayTransferFingerprint(config.getContentGeneratorConfig())
  )
    throw new GatewayConversationError(
      'unsupported',
      'The conversation or model changed while awaiting authorization. Select the destination again.',
    );
  ensureIdle();
  const selectionInProgress = { sessionId };
  selectionsInProgress.set(config, selectionInProgress);
  try {
    await switchModel();
    if (sessionId !== config.getSessionId())
      throw new GatewayConversationError(
        'unsupported',
        'The conversation or model changed while awaiting authorization. Select the destination again.',
      );
    if (requiresConsent)
      recordGatewayAccountSelection(config, sourceModel, target.model);
    return true;
  } finally {
    if (selectionsInProgress.get(config) === selectionInProgress)
      selectionsInProgress.delete(config);
  }
}

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
        normalizeGatewayEndpoint(
          config.reasoningRouteBaseUrl ?? config.baseUrl ?? '',
        ),
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
      'Native transfer requires two discovered accounts of the same provider, account type and native model. Explicit account selection can send the supplied history as new input instead.',
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
    throw gatewayFailure(
      { status: response.status, headers: errorHeaders, error },
      [
        headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '',
        headers.get('x-api-key') ?? '',
      ],
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
