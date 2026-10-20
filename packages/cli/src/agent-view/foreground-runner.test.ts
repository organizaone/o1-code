/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, it, vi } from 'vitest';
import { runAgentSessionForeground } from './foreground-runner.js';

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  readSupervisor: vi.fn(),
  call: vi.fn(),
  attach: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('./supervisor-runner.js', () => ({
  ensureAgentViewSupervisor: mocks.ensure,
}));
vi.mock('./supervisor-store.js', () => ({
  readAgentViewSupervisor: mocks.readSupervisor,
}));
vi.mock('./supervisor-client.js', () => ({
  callAgentViewSupervisor: mocks.call,
  attachAgentViewSupervisorTerminal: mocks.attach,
  watchAgentViewOwner: mocks.watch,
}));

it('starts an empty managed worker and attaches it without a model request', async () => {
  const peek = vi
    .fn()
    .mockResolvedValueOnce({
      state: { sessionState: 'starting', processState: 'starting' },
    })
    .mockResolvedValueOnce({
      state: {
        sessionState: 'idle',
        processState: 'alive',
        ownership: 'managed',
      },
    })
    .mockResolvedValueOnce({
      state: {
        sessionState: 'idle',
        processState: 'alive',
        ownership: 'managed',
      },
    })
    .mockResolvedValueOnce({
      state: {
        sessionState: 'idle',
        processState: 'exited',
        attachState: 'detached',
      },
    });
  mocks.ensure.mockResolvedValue({ socketPath: 'socket', peek });
  mocks.readSupervisor.mockResolvedValue({ authToken: 'secret' });
  mocks.call.mockResolvedValue({ sessionId: 'session-1' });
  const dispose = vi.fn();
  mocks.watch.mockResolvedValue({ dispose });
  mocks.attach.mockImplementation(
    async (
      _socket: string,
      _id: string,
      options: { onAttached(): void; detachSignal: AbortSignal },
    ) => {
      options.onAttached();
      return new Promise((resolve) =>
        options.detachSignal.addEventListener(
          'abort',
          () => resolve({ reason: 'detached' }),
          { once: true },
        ),
      );
    },
  );

  await runAgentSessionForeground();

  expect(mocks.call).toHaveBeenCalledWith(
    'socket',
    'dispatch',
    { cwd: process.cwd(), interactive: true, ownerId: expect.any(String) },
    { authToken: 'secret', timeoutMs: 30_000 },
  );
  expect(mocks.attach).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});

it('stops its new worker when startup fails before terminal attachment', async () => {
  const stop = vi.fn().mockResolvedValue(undefined);
  mocks.ensure.mockResolvedValueOnce({
    socketPath: 'socket',
    peek: vi.fn().mockResolvedValue({
      state: { sessionState: 'failed', processState: 'exited' },
    }),
    stop,
  });
  mocks.readSupervisor.mockResolvedValueOnce({ authToken: 'secret' });
  mocks.call.mockResolvedValueOnce({ sessionId: 'failed-session' });
  const dispose = vi.fn();
  mocks.watch.mockResolvedValueOnce({ dispose });

  await expect(runAgentSessionForeground()).rejects.toThrow('failed to start');
  expect(stop).toHaveBeenCalledWith('failed-session');
  expect(dispose).toHaveBeenCalledOnce();
});
