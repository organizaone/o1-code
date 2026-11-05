/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { gatewayFailure } from './gateway-errors.js';
import { normalizeGatewayEndpoint } from './gateway-request.js';

describe('gateway diagnostics', () => {
  it.each([
    [409, 'conversation_busy', 'busy'],
    [409, 'invalid_tool_results', 'tool_mismatch'],
    [409, 'conversation_transfer_required', 'transfer_required'],
    [403, 'permission_error', 'authorization'],
    [429, 'rate_limit_exceeded', 'unavailable'],
    [409, 'execution_uncertain', 'uncertain'],
  ] as const)(
    'preserves status %s and server code %s',
    (status, code, reason) => {
      const error = gatewayFailure({
        status,
        error: { code, message: 'Specific safe server explanation' },
      });
      expect(error).toMatchObject({
        status,
        providerCode: code,
        reason,
        message: 'Specific safe server explanation',
      });
    },
  );

  it('does not invent status or code missing from a streamed refusal', () => {
    const error = gatewayFailure(
      new Error(
        'event:error\ndata: {"error":{"type":"invalid_request_error","message":"Pending tool results do not match this session"}}',
      ),
    );
    expect(error).toMatchObject({
      providerCode: 'invalid_request_error',
      message: 'Pending tool results do not match this session',
    });
    expect(error.status).toBeUndefined();
  });

  it('removes terminal controls and credentials without hiding the safe diagnosis', () => {
    const error = gatewayFailure(
      {
        status: 409,
        error: {
          code: 'conversation_busy',
          message:
            '\u001b[31mBusy\u001b[0m synthetic-secret https://user:password@example.test/',
        },
      },
      ['synthetic-secret'],
    );
    expect(error.message).toContain('Busy');
    expect(error.message).not.toContain('\u001b');
    expect(error.message).not.toMatch(/synthetic-secret|password/);
  });

  it('canonicalizes URL spelling without merging distinct gateways or prefixes', () => {
    expect(normalizeGatewayEndpoint('HTTPS://Gateway.Example:443/v1/')).toBe(
      'https://gateway.example',
    );
    expect(normalizeGatewayEndpoint('https://gateway.example/prefix/v1')).toBe(
      'https://gateway.example/prefix',
    );
    expect(normalizeGatewayEndpoint('http://gateway.example/v1')).not.toBe(
      normalizeGatewayEndpoint('https://gateway.example/v1'),
    );
    expect(normalizeGatewayEndpoint('https://other.example/v1')).not.toBe(
      normalizeGatewayEndpoint('https://gateway.example/v1'),
    );
  });
});
