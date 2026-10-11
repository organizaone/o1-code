/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  openRemote,
  type RemoteAgent,
  type RemoteAgentEvents,
  type RemoteCommandName,
  type RemoteDecision,
  type RemoteDecisionKind,
  type RemoteDecisionOption,
  type RemoteDecisionRequest,
  type RemoteSessionInfo,
  type RemoteState,
} from '../../../vendor/o1-connect/lib.mjs';
import type { O1ConnectSession, RemoteSessionOptions } from './session.js';

export type {
  RemoteAgent,
  RemoteAgentEvents,
  RemoteCommandName,
  RemoteDecision,
  RemoteDecisionKind,
  RemoteDecisionOption,
  RemoteDecisionRequest,
  RemoteSessionInfo,
  RemoteSessionOptions,
  RemoteState,
};

/** The `remote.viaTunnel` setting: whether remote mode rides the o1-connect tunnel. */
export type RemoteViaTunnel = 'auto' | 'always' | 'never';

export const REMOTE_VIA_TUNNEL_VALUES: readonly RemoteViaTunnel[] = [
  'auto',
  'always',
  'never',
];

export function isRemoteViaTunnel(value: unknown): value is RemoteViaTunnel {
  return (REMOTE_VIA_TUNNEL_VALUES as readonly unknown[]).includes(value);
}

/**
 * How the terminal reaches the gateway's `/remote/agent` (contract §5.1):
 * straight at the proxy's URL with the device key, or through the pinned
 * tunnel of an open o1-connect session.
 */
export type RemoteTransport =
  | { kind: 'direct'; baseUrl: string; apiKey: string }
  | { kind: 'tunnel'; tunnel: O1ConnectSession };

/**
 * Puts a terminal session in remote mode. Resolves once the gateway said
 * `ready` and viewers may attach; rejects with an `O1ConnectError`
 * (`remote_refused`, `remote_protocol`, `tunnel_unavailable`) otherwise.
 */
export async function openRemoteSession(
  transport: RemoteTransport,
  options: RemoteSessionOptions,
): Promise<RemoteAgent> {
  if (transport.kind === 'tunnel') {
    return transport.tunnel.openRemote(options);
  }
  return openRemote({
    ...options,
    baseUrl: transport.baseUrl,
    apiKey: transport.apiKey,
  });
}
