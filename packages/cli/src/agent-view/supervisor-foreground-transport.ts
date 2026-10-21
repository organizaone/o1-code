/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { attachAgentViewSupervisorTerminal } from './supervisor-client.js';
import type { AgentSessionForegroundTransport } from './foreground-controller.js';

export interface SupervisorForegroundTransportOptions {
  socketPath: string;
  authToken: string;
  peek(sessionId: string): Promise<unknown>;
  stdin?: Readable;
  stdout?: Writable;
  detachPollMs?: number;
  detachTimeoutMs?: number;
}

export function createSupervisorForegroundTransport(
  options: SupervisorForegroundTransportOptions,
): AgentSessionForegroundTransport {
  return {
    async canAttach(sessionId) {
      const snapshot = await options.peek(sessionId);
      const state = readState(snapshot);
      if (state?.['ownership'] !== 'managed') return false;
      if (
        state['processState'] === 'alive' ||
        state['processState'] === 'starting' ||
        state['processState'] === 'hibernated'
      )
        return true;
      return (
        state['processState'] === 'exited' &&
        ['completed', 'idle', 'failed', 'stopped'].includes(
          String(state['sessionState']),
        )
      );
    },
    async waitDetached(sessionId) {
      const deadline = Date.now() + (options.detachTimeoutMs ?? 3000);
      do {
        const snapshot = await options.peek(sessionId);
        const state = readState(snapshot);
        if (state?.['attachState'] === 'detached') return;
        if (!state || state['processState'] === 'exited') return;
        await delay(options.detachPollMs ?? 50);
      } while (Date.now() < deadline);
      throw new Error(`Session ${sessionId} did not detach in time.`);
    },
    attach(sessionId, detachSignal, onAttached) {
      return attachAgentViewSupervisorTerminal(options.socketPath, sessionId, {
        authToken: options.authToken,
        ...(options.stdin ? { stdin: options.stdin } : {}),
        ...(options.stdout ? { stdout: options.stdout } : {}),
        detachSignal,
        onAttached,
      });
    },
  };
}

function readState(snapshot: unknown): Record<string, unknown> | undefined {
  if (!isRecord(snapshot) || !isRecord(snapshot['state'])) return undefined;
  return snapshot['state'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
