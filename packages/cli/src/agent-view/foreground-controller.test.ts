/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { AgentSessionForegroundController } from './foreground-controller.js';

function createTransport() {
  const live = new Set(['first', 'second']);
  const attachments: string[] = [];
  const detached: string[] = [];
  const failed = new Set<string>();
  const controller = new AgentSessionForegroundController({
    canAttach: async (id) => live.has(id),
    attach: async (id, signal, onAttached) => {
      attachments.push(id);
      if (failed.has(id)) throw new Error('attach failed');
      onAttached();
      return new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            detached.push(id);
            resolve({ reason: 'detached' });
          },
          { once: true },
        );
      });
    },
  });
  return { controller, live, attachments, detached, failed };
}

describe('AgentSessionForegroundController', () => {
  it('changes the input owner without stopping the outgoing session', async () => {
    const { controller, attachments, detached } = createTransport();
    await controller.select('first');
    await controller.select('second');
    expect(controller.activeSessionId).toBe('second');
    expect(attachments).toEqual(['first', 'second']);
    expect(detached).toEqual(['first']);
    await controller.suspend();
    expect(controller.activeSessionId).toBeUndefined();
    await controller.resume();
    expect(controller.activeSessionId).toBe('second');
    expect(attachments).toEqual(['first', 'second', 'second']);
    await controller.suspend();
  });

  it('keeps the current attachment when a target is stale', async () => {
    const { controller, live, attachments, detached } = createTransport();
    await controller.select('first');
    live.delete('second');
    await expect(controller.select('second')).rejects.toThrow('unavailable');
    expect(controller.activeSessionId).toBe('first');
    expect(attachments).toEqual(['first']);
    expect(detached).toEqual([]);
    await controller.suspend();
  });

  it('reattaches the outgoing session when the new attach fails', async () => {
    const { controller, attachments, detached, failed } = createTransport();
    await controller.select('first');
    failed.add('second');
    await expect(controller.select('second')).rejects.toThrow('attach failed');
    expect(controller.activeSessionId).toBe('first');
    expect(attachments).toEqual(['first', 'second', 'first']);
    expect(detached).toEqual(['first']);
    await controller.suspend();
  });

  it('serializes repeated selections', async () => {
    const { controller, attachments } = createTransport();
    await controller.select('first');
    await Promise.all([
      controller.select('second'),
      controller.select('second'),
    ]);
    expect(attachments).toEqual(['first', 'second']);
    await controller.suspend();
  });

  it('waits for supervisor detach before attaching another session', async () => {
    let confirmDetach = () => {};
    const detached = new Promise<void>((resolve) => {
      confirmDetach = resolve;
    });
    const waitDetached = vi.fn(async () => detached);
    const attach = vi.fn(
      async (_id: string, signal: AbortSignal, onAttached: () => void) => {
        onAttached();
        return new Promise<{ reason: 'detached' }>((resolve) => {
          signal.addEventListener(
            'abort',
            () => resolve({ reason: 'detached' }),
            { once: true },
          );
        });
      },
    );
    const controller = new AgentSessionForegroundController({
      canAttach: async () => true,
      attach,
      waitDetached,
    });
    await controller.select('first');
    const switching = controller.select('second');
    await vi.waitFor(() => expect(waitDetached).toHaveBeenCalledWith('first'));
    expect(attach).toHaveBeenCalledTimes(1);
    confirmDetach();
    await switching;
    expect(attach).toHaveBeenCalledTimes(2);
    await controller.suspend();
  });
});
