/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { getErrorStatus } from './errors.js';

/**
 * The text of the tunnel endpoint's `502` once the gateway stopped accepting
 * the device's key: the device was disconnected, removed, or set up on another
 * machine (contract §3.2). The library writes it; this side only reads it.
 */
const DEVICE_KEY_REFUSED = /does not accept this device's key/i;

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/**
 * Whether a request through the tunnel's loopback endpoint was answered with
 * that `502`. No retry can change the answer: the way back is a new
 * connection code.
 */
export function isO1ConnectDeviceRefused(error: unknown): boolean {
  if (getErrorStatus(error) !== 502) return false;
  const { message, error: body } = error as {
    message?: unknown;
    error?: unknown;
  };
  return (
    DEVICE_KEY_REFUSED.test(textOf(message)) ||
    DEVICE_KEY_REFUSED.test(textOf(body))
  );
}
