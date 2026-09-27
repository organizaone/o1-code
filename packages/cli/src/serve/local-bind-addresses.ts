/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { networkInterfaces } from 'node:os';

/**
 * Whether this host has the IPv6 loopback (`::1`) assigned on any
 * interface. A wildcard `::` listener is always dual-stack under Node
 * (libuv pins `IPV6_V6ONLY=0` unless `ipv6Only` is requested), so such a
 * daemon usually answers on BOTH loopbacks — but an IPv4-less host has only
 * `::1`, and a host that binds `::` while its loopback carries no `::1`
 * (e.g. `net.ipv6.conf.lo.disable_ipv6=1`) has only `127.0.0.1`.
 */
export function hostAssignsIpv6Loopback(
  interfaces = networkInterfaces(),
): boolean {
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv6' && entry.address === '::1') return true;
    }
  }
  return false;
}
