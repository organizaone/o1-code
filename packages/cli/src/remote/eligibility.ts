/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@organizaone/o1-code-core/config/config.js';
import {
  fetchKeyInfo as fetchKeyInfoFromProxy,
  type KeyInfo,
} from '@organizaone/o1-code-core/providers/organizaone-limits.js';
import type { RemoteTransport } from '@organizaone/o1-code-core/providers/o1-connect/remote.js';
import { isOrganizaOneBaseUrl } from '@organizaone/o1-code-core/providers/presets/organizaone.js';

/**
 * Whether this session may go remote, and how it reaches the gateway
 * (contract §5.5). The plan is asked on every check: it costs nothing and
 * the answer changes when the plan or the installation's switch does.
 */
export type RemoteEligibility =
  | {
      status: 'ok';
      transport: RemoteTransport;
      limits: { maxSessions: number; maxViewers: number };
    }
  /** The model does not go through OrganizaOne with the account's device key. */
  | { status: 'needs-account' }
  /** `remote.viaTunnel: always`, and no o1-connect tunnel is open. */
  | { status: 'tunnel-required' }
  /** `remote.viaTunnel: never`, and the only credential is the tunnel's. */
  | { status: 'direct-unavailable' }
  /** The plan, or the installation, does not include remote sessions. */
  | { status: 'plan' }
  /** The gateway gave no answer about the key. */
  | { status: 'unavailable' };

export type RemoteEligibilityConfig = Pick<
  Config,
  | 'getContentGeneratorConfig'
  | 'getCliVersion'
  | 'getO1ConnectSession'
  | 'getRemoteViaTunnel'
>;

export interface RemoteEligibilityDeps {
  fetchKeyInfo?: typeof fetchKeyInfoFromProxy;
  signal?: AbortSignal;
}

export async function checkRemoteEligibility(
  config: RemoteEligibilityConfig,
  deps: RemoteEligibilityDeps = {},
): Promise<RemoteEligibility> {
  const generator = config.getContentGeneratorConfig();
  const tunnel = config.getO1ConnectSession();
  const viaTunnel = config.getRemoteViaTunnel();
  const direct =
    generator && isOrganizaOneBaseUrl(generator.baseUrl) && generator.apiKey
      ? { baseUrl: generator.baseUrl ?? '', apiKey: generator.apiKey }
      : undefined;
  const throughTunnel =
    generator?.connection === 'o1-connect' && tunnel ? tunnel : undefined;

  let transport: RemoteTransport;
  if (viaTunnel === 'always') {
    if (!throughTunnel) return { status: 'tunnel-required' };
    transport = { kind: 'tunnel', tunnel: throughTunnel };
  } else if (viaTunnel === 'never') {
    if (direct) transport = { kind: 'direct', ...direct };
    else if (throughTunnel) return { status: 'direct-unavailable' };
    else return { status: 'needs-account' };
  } else if (throughTunnel) {
    transport = { kind: 'tunnel', tunnel: throughTunnel };
  } else if (direct) {
    transport = { kind: 'direct', ...direct };
  } else {
    return { status: 'needs-account' };
  }

  // Through the tunnel the generator's URL is the loopback endpoint, which
  // speaks the proxy's API with the device key swapped in: the same call
  // reaches /v1/key on both transports.
  const info: KeyInfo | null = await (
    deps.fetchKeyInfo ?? fetchKeyInfoFromProxy
  )({
    baseUrl: generator?.baseUrl ?? '',
    apiKey: generator?.apiKey ?? '',
    clientVersion: config.getCliVersion(),
    ...(deps.signal ? { signal: deps.signal } : {}),
  });
  if (!info) return { status: 'unavailable' };
  if (!info.remote?.enabled) return { status: 'plan' };
  return {
    status: 'ok',
    transport,
    limits: {
      maxSessions: info.remote.maxSessions,
      maxViewers: info.remote.maxViewers,
    },
  };
}
