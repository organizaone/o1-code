/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { hostAssignsIpv6Loopback } from './local-bind-addresses.js';

describe('hostAssignsIpv6Loopback', () => {
  const v4Loopback: NetworkInterfaceInfo = {
    address: '127.0.0.1',
    netmask: '255.0.0.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal: true,
    cidr: '127.0.0.1/8',
  };
  const v6Loopback: NetworkInterfaceInfo = {
    address: '::1',
    netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    family: 'IPv6',
    mac: '00:00:00:00:00:00',
    internal: true,
    cidr: '::1/128',
    scopeid: 0,
  };
  // A global IPv6 address is not the loopback — a host that binds `::` with
  // IPv6 only on non-loopback interfaces still has no `::1` to dial.
  const v6Global: NetworkInterfaceInfo = {
    address: '2001:db8::5',
    netmask: 'ffff:ffff:ffff:ffff::',
    family: 'IPv6',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: '2001:db8::5/64',
    scopeid: 2,
  };

  it('reports true when the table assigns ::1', () => {
    expect(hostAssignsIpv6Loopback({ lo: [v4Loopback, v6Loopback] })).toBe(
      true,
    );
  });

  it('reports false when no entry is ::1', () => {
    expect(hostAssignsIpv6Loopback({ lo: [v4Loopback] })).toBe(false);
    expect(hostAssignsIpv6Loopback({ eth0: [v6Global] })).toBe(false);
    expect(hostAssignsIpv6Loopback({})).toBe(false);
  });

  it('reads the live interface table when called with no argument', () => {
    const live = Object.values(networkInterfaces()).some((entries) =>
      entries?.some((info) => info.family === 'IPv6' && info.address === '::1'),
    );
    expect(hostAssignsIpv6Loopback()).toBe(live);
  });
});
