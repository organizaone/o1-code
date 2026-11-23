/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { Server } from 'node:http';
import type { Socket } from 'node:net';

export const DEFAULT_LISTENER_MAX_CONNECTIONS = 256;
export const DEFAULT_WRITER_IDLE_TIMEOUT_MS = 60_000;
const SOCKET_KEEPALIVE_INITIAL_DELAY_MS = 30_000;
// Short requests (/health, the Web Shell, JSON routes) keep the remaining
// share of the listener budget, so long-lived streams cannot take the daemon
// offline by filling `server.maxConnections`.
const SSE_LISTENER_SHARE = 0.8;

/**
 * Concurrent `GET /session/:id/events` streams admitted before new ones get
 * 503. `undefined` means uncapped: `0` / `Infinity`, or no finite listener
 * budget to derive from. Explicit values are clamped below the listener's
 * share so they cannot remove the headroom the cap exists for.
 */
export function resolveMaxSseConnections(
  maxSseConnections: number | undefined,
  maxConnections: number | undefined,
): number | undefined {
  const listener = maxConnections ?? DEFAULT_LISTENER_MAX_CONNECTIONS;
  const ceiling =
    listener > 0 && Number.isFinite(listener)
      ? Math.max(1, Math.floor(listener * SSE_LISTENER_SHARE))
      : undefined;
  if (maxSseConnections === undefined) return ceiling;
  if (maxSseConnections === 0 || maxSseConnections === Infinity) {
    return undefined;
  }
  const floored = Math.max(1, Math.floor(maxSseConnections));
  return ceiling === undefined ? floored : Math.min(floored, ceiling);
}

export function assertValidMaxSseConnections(value: number | undefined): void {
  if (value !== undefined && (Number.isNaN(value) || value < 0)) {
    throw new TypeError(
      `Invalid maxSseConnections: ${value}. Must be >= 0 ` +
        `(0 / Infinity = uncapped).`,
    );
  }
}

/** Writer idle budget in effect; `undefined` when the reaper is disabled (0). */
export function effectiveWriterIdleTimeoutMs(
  value: number | undefined,
): number | undefined {
  if (value === undefined) return DEFAULT_WRITER_IDLE_TIMEOUT_MS;
  return value > 0 ? value : undefined;
}

/**
 * Lets the kernel reap half-open idle peers (NAT-dropped phones, sleeping
 * laptops) that would otherwise hold a listener slot until the process exits.
 */
export function enableSocketKeepAlive(server: Server): void {
  server.on('connection', (socket: Socket) => {
    socket.setKeepAlive(true, SOCKET_KEEPALIVE_INITIAL_DELAY_MS);
  });
}

/**
 * Frees a stalled writer's slot. `destroy()` on a socket with unsent data
 * sends a FIN the zero-window peer never acknowledges; a reset does not wait.
 * TLS sockets cannot reset (`ERR_INVALID_HANDLE_TYPE`), so they fall back to
 * `destroy()`.
 */
export function forceCloseSocket(socket: Socket | null | undefined): void {
  if (!socket || socket.destroyed) return;
  try {
    socket.resetAndDestroy();
  } catch {
    socket.destroy();
  }
}
