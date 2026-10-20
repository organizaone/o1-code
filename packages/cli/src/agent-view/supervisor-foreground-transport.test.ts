/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { createSupervisorForegroundTransport } from './supervisor-foreground-transport.js';

const attachTerminal = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ reason: 'detached' }),
);

vi.mock('./supervisor-client.js', () => ({
  attachAgentViewSupervisorTerminal: (...args: unknown[]) =>
    attachTerminal(...args),
}));

describe('createSupervisorForegroundTransport', () => {
  it('rejects nonmanaged work but permits completed managed sessions to resume', async () => {
    const peek = vi
      .fn()
      .mockResolvedValueOnce({
        state: { ownership: 'unmanaged', processState: 'alive' },
      })
      .mockResolvedValueOnce({
        state: {
          ownership: 'managed',
          processState: 'exited',
          sessionState: 'completed',
        },
      })
      .mockResolvedValueOnce({
        state: { ownership: 'managed', processState: 'alive' },
      });
    const transport = createSupervisorForegroundTransport({
      socketPath: 'socket',
      authToken: 'secret',
      peek,
    });
    await expect(transport.canAttach('session')).resolves.toBe(false);
    await expect(transport.canAttach('session')).resolves.toBe(true);
    await expect(transport.canAttach('session')).resolves.toBe(true);
  });

  it('passes the input owner and detach signal into the authenticated stream', async () => {
    const peek = vi.fn();
    const transport = createSupervisorForegroundTransport({
      socketPath: 'socket',
      authToken: 'secret',
      peek,
    });
    const abort = new AbortController();
    const onAttached = vi.fn();
    await transport.attach('session', abort.signal, onAttached);
    expect(attachTerminal).toHaveBeenCalledWith(
      'socket',
      'session',
      expect.objectContaining({
        authToken: 'secret',
        detachSignal: abort.signal,
        onAttached,
      }),
    );
  });

  it('waits for the supervisor to persist detached state', async () => {
    const peek = vi
      .fn()
      .mockResolvedValueOnce({ state: { attachState: 'attached' } })
      .mockResolvedValueOnce({ state: { attachState: 'detached' } });
    const transport = createSupervisorForegroundTransport({
      socketPath: 'socket',
      authToken: 'secret',
      peek,
      detachPollMs: 1,
    });
    await transport.waitDetached?.('session');
    expect(peek).toHaveBeenCalledTimes(2);
  });
});
