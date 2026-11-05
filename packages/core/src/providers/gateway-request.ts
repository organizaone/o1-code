/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Content, GenerateContentParameters } from '@google/genai';

export const GATEWAY_OPERATION_PURPOSES = [
  'title',
  'summary',
  'compaction',
  'suggestion',
] as const;
export type GatewayOperationPurpose =
  (typeof GATEWAY_OPERATION_PURPOSES)[number];

export interface GatewayIndependentRequest {
  id: string;
  purpose?: GatewayOperationPurpose;
}

export type GatewayGenerateRequest = GenerateContentParameters & {
  gatewayIndependentRequest?: GatewayIndependentRequest;
};

export interface GatewayRequestScope {
  conversationId: string;
  model: string;
  operation?: { id: string; purpose: GatewayOperationPurpose };
  transfer?: { sourceModel?: string; dispatched: boolean };
  confirmGroupTransfer?: (signal: AbortSignal | undefined) => Promise<boolean>;
}

export const gatewayRequestScope = new AsyncLocalStorage<GatewayRequestScope>();

export class GatewayConversationError extends Error {
  readonly code = 'gateway_conversation_error';
  readonly status?: number;
  readonly headers?: Headers;
  readonly providerCode?: string;

  constructor(
    readonly reason:
      | 'legacy'
      | 'conflict'
      | 'uncertain'
      | 'cancelled'
      | 'unsupported'
      | 'unavailable',
    message: string,
    details?: { status?: number; headers?: Headers; providerCode?: string },
  ) {
    super(message);
    this.name = 'GatewayConversationError';
    this.status = details?.status;
    this.headers = details?.headers;
    this.providerCode = details?.providerCode;
  }
}

export function isGatewayIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)
  );
}

export function createGatewayIndependentRequest(
  purpose?: GatewayOperationPurpose,
): GatewayIndependentRequest {
  return { id: randomUUID(), ...(purpose ? { purpose } : {}) };
}

/** Source material is input to a new task, never an authenticated assistant/tool chain. */
export function gatewayIndependentInput(contents: Content[]): Content[] {
  if (
    !contents.some(
      (content) =>
        content.role === 'model' ||
        content.parts?.some(
          (part) => part.functionCall || part.functionResponse,
        ),
    )
  )
    return contents;
  return [
    {
      role: 'user',
      parts: [
        {
          text: `Source material for this independent task (JSON):\n${JSON.stringify(contents)}`,
        },
      ],
    },
  ];
}

export function withGatewayRequestHeaders(
  fetcher: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const scope = gatewayRequestScope.getStore();
    if (!scope) return fetcher(input, init);
    const body: unknown =
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (
      !body ||
      typeof body !== 'object' ||
      !('model' in body) ||
      body.model !== scope.model
    )
      throw new GatewayConversationError(
        'unsupported',
        'The serialized gateway model differs from the selected route. Remove the model override from generation settings; no fallback request was sent.',
      );
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('x-o1gw-conversation-id', scope.conversationId);
    // These headers belong to this invocation, never to configured defaults.
    headers.delete('x-o1gw-operation-id');
    headers.delete('x-o1gw-operation-purpose');
    headers.delete('x-o1gw-conversation-transfer');
    if (scope.operation) {
      headers.set('x-o1gw-operation-id', scope.operation.id);
      headers.set('x-o1gw-operation-purpose', scope.operation.purpose);
    }
    const nextInit = { ...init, headers, redirect: 'error' as const };
    if (scope.transfer) {
      if (scope.transfer.dispatched)
        throw new GatewayConversationError(
          'uncertain',
          'A transfer request cannot be dispatched twice.',
        );
      const { prepareGatewayTransfer } = await import('./gateway-transfer.js');
      const preparedInit = await prepareGatewayTransfer(
        fetcher,
        input,
        nextInit,
        scope.transfer.sourceModel,
      );
      scope.transfer.dispatched = true;
      return fetcher(input, preparedInit);
    }
    const response = await fetcher(input, nextInit);
    if (
      response.status === 409 &&
      scope.confirmGroupTransfer &&
      !scope.operation
    ) {
      const responseBody: unknown = await response
        .clone()
        .json()
        .catch(() => null);
      const proposal =
        responseBody &&
        typeof responseBody === 'object' &&
        'conversation_transfer' in responseBody
          ? responseBody.conversation_transfer
          : undefined;
      if (
        proposal &&
        typeof proposal === 'object' &&
        'requires_confirmation' in proposal &&
        proposal.requires_confirmation === true &&
        'prepare_endpoint' in proposal &&
        proposal.prepare_endpoint === '/v1/conversations/transfer' &&
        (await scope.confirmGroupTransfer(init?.signal ?? undefined))
      ) {
        scope.transfer = { dispatched: true };
        const { prepareGatewayTransfer } = await import(
          './gateway-transfer.js'
        );
        return fetcher(
          input,
          await prepareGatewayTransfer(fetcher, input, nextInit),
        );
      }
    }
    return response;
  };
}
