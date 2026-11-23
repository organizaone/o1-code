/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

// crypto.randomUUID exists only in secure contexts (HTTPS or loopback), and
// the shell is also served over plain HTTP from remote hosts. getRandomValues
// stays available there, so the fallback still yields an RFC 4122 v4 id.
export function randomUUID(): string {
  if (typeof crypto === 'undefined') {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
