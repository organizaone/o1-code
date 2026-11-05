/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { stripAnsiAndControl } from '../utils/textUtils.js';
import { getErrorStatus, isAbortError } from '../utils/errors.js';
import { getErrorHeader } from '../utils/retryPolicy.js';
import { getRateLimitErrorDetails } from '../utils/rateLimit.js';
import { redactProxyCredentials } from '../utils/runtimeFetchOptions.js';
import { GatewayConversationError } from './gateway-request.js';

export function gatewayFailure(
  error: unknown,
  secrets: readonly string[] = [],
): GatewayConversationError {
  let current = error;
  let status: number | undefined;
  let providerCode: string | undefined;
  let message: string | undefined;
  const headers = new Headers();
  for (let depth = 0; depth < 6 && current; depth++) {
    if (current instanceof GatewayConversationError) return current;
    status ??= getErrorStatus(current);
    const diagnostic = getRateLimitErrorDetails(current);
    providerCode ??= diagnostic.providerCode;
    message ??= diagnostic.providerMessage;
    if (status === undefined && current instanceof Error) {
      const start = current.message.indexOf('{');
      const end = current.message.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          const envelope: unknown = JSON.parse(
            current.message.slice(start, end + 1),
          );
          status = getErrorStatus(envelope);
          if (envelope && typeof envelope === 'object' && 'error' in envelope)
            status ??= getErrorStatus(envelope.error);
        } catch {
          // A plain transport message is not a server diagnostic envelope.
        }
      }
    }
    for (const name of [
      'x-o1gw-device-state',
      'retry-after',
      'x-o1gw-limit',
      'x-o1gw-limit-reset',
    ]) {
      const value = getErrorHeader(current, name);
      if (value && !headers.has(name)) headers.set(name, value);
    }
    if (typeof current !== 'object') break;
    const row = current as Record<string, unknown>;
    if (row['error'] && typeof row['error'] === 'object') {
      const payload = row['error'] as Record<string, unknown>;
      const code = payload['code'] ?? payload['type'];
      if (typeof code === 'string') providerCode = code;
      if (typeof payload['message'] === 'string') message = payload['message'];
      status ??= getErrorStatus(payload);
    }
    current = row['cause'];
  }
  if (providerCode && !/^[A-Za-z0-9_.-]{1,80}$/.test(providerCode))
    providerCode = undefined;
  if (message) {
    for (const secret of secrets) {
      if (secret) message = message.split(secret).join('[redacted]');
    }
    message = stripAnsiAndControl(redactProxyCredentials(message))
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      .slice(0, 4096)
      .trim();
  }
  const details = { status, headers, providerCode };
  let reason: GatewayConversationError['reason'];
  if (isAbortError(error)) reason = 'cancelled';
  else if (status === 408 || (status !== undefined && status >= 500))
    reason = 'uncertain';
  else if (providerCode === 'conversation_busy') reason = 'busy';
  else if (providerCode === 'conversation_transfer_required')
    reason = 'transfer_required';
  else if (
    ['invalid_tool_results', 'tool_result_mismatch', 'pending_tools'].includes(
      providerCode ?? '',
    )
  )
    reason = 'tool_mismatch';
  else if (
    [
      'execution_uncertain',
      'termination_uncertain',
      'transfer_uncertain',
    ].includes(providerCode ?? '')
  )
    reason = 'uncertain';
  else if (
    status === 401 ||
    status === 403 ||
    [
      'authentication_error',
      'permission_error',
      'permission_denied',
      'device_revoked',
      'device_expired',
      'device_suspended',
    ].includes(providerCode ?? '')
  )
    reason = 'authorization';
  else if (
    status === 409 ||
    ['conversation_unavailable', 'transfer_unavailable'].includes(
      providerCode ?? '',
    )
  )
    reason = 'conflict';
  else if (
    (status && status >= 400 && status < 500 && status !== 408) ||
    [
      'invalid_request_error',
      'rate_limit_exceeded',
      'rate_limit_error',
    ].includes(providerCode ?? '')
  )
    reason = 'unavailable';
  else reason = 'uncertain';
  const fallback =
    reason === 'cancelled'
      ? 'The gateway request was cancelled. Remote execution is not confirmed; no request was replayed.'
      : reason === 'uncertain'
        ? 'The gateway request did not complete with a confirmed result. Your history is preserved; no request was replayed or moved to another account.'
        : `The gateway refused the request${status ? ` (HTTP ${status})` : ''}. Your history and selected account are preserved.`;
  return new GatewayConversationError(reason, message || fallback, details);
}
