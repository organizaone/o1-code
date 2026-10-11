/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeGateway } from './fake-gateway.js';
import {
  REMOTE_HISTORY_BYTES,
  RemoteSession,
  trimToBudget,
} from './remote-session.js';

const session = {
  id: 'sess-1',
  name: 'laptop',
  cwd: '/w/app',
  version: '0.15.0',
  approvalMode: 'default',
  model: 'claude-haiku-4-5',
};

let gateway: FakeGateway;
const opened: RemoteSession[] = [];

async function open(
  options: Partial<Parameters<typeof RemoteSession.open>[0]> = {},
): Promise<RemoteSession> {
  const remote = await RemoteSession.open({
    transport: { kind: 'direct', baseUrl: gateway.baseUrl, apiKey: 'dk' },
    session,
    ...options,
  });
  opened.push(remote);
  return remote;
}

beforeEach(async () => {
  gateway = await FakeGateway.start();
});

afterEach(async () => {
  for (const remote of opened.splice(0)) await remote.close();
  await gateway.close();
});

describe('RemoteSession', () => {
  it('says hello with the session and the conversation on screen, and resolves on ready', async () => {
    const remote = await open({
      seedHistory: () => [{ type: 'user', message: { content: 'hi' } }],
    });
    expect(remote.remoteId).toBe('rm_test');
    expect(remote.url).toContain('/me/remote/rm_test');
    expect(remote.state).toBe('online');
    expect(remote.viewers).toBe(0);
    expect(gateway.hellos[0]).toMatchObject({
      session_id: 'sess-1',
      name: 'laptop',
      cwd_hint: '/w/app',
      o1code_version: '0.15.0',
      approval_mode: 'default',
      model: 'claude-haiku-4-5',
      history: [{ type: 'user', message: { content: 'hi' } }],
    });
  });

  it('mirrors events and status, keeping whole events but not deltas for the next hello', async () => {
    const remote = await open({ seedHistory: () => [{ type: 'system' }] });
    const event = gateway.next('event');
    remote.send({ type: 'stream_event', event: { type: 'message_stop' } });
    expect((await event)['ev']).toEqual({
      type: 'stream_event',
      event: { type: 'message_stop' },
    });
    const whole = gateway.next('event');
    remote.send({ type: 'assistant', message: { content: 'done' } });
    await whole;
    const status = gateway.next('status');
    remote.status({ state: 'streaming', model: 'm2' });
    expect(await status).toMatchObject({ state: 'streaming', model: 'm2' });

    expect(remote.history()).toEqual([
      { type: 'system' },
      { type: 'assistant', message: { content: 'done' } },
    ]);

    // A resync draws a fresh hello whose history is the screen plus the ring.
    const hello = gateway.next('hello');
    gateway.send({ type: 'resync' });
    expect((await hello)['history']).toEqual(remote.history());
  });

  it('hands a viewer’s input, commands and presence to the terminal', async () => {
    const remote = await open();
    const input = vi.fn();
    const command = vi.fn();
    const changes: unknown[] = [];
    remote.on('input', input);
    remote.on('command', command);
    remote.onChange((snapshot) => changes.push(snapshot));

    gateway.send({ type: 'viewer', op: 'attached', count: 1 });
    gateway.send({
      type: 'input',
      from: 'v1',
      id: 'i1',
      text: 'run the tests',
    });
    gateway.send({ type: 'command', from: 'v1', id: 'c1', name: 'interrupt' });
    await vi.waitFor(() => expect(command).toHaveBeenCalled());

    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'i1', text: 'run the tests' }),
    );
    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'interrupt' }),
    );
    expect(remote.viewers).toBe(1);
    expect(changes).toContainEqual({ state: 'online', viewers: 1 });
    // The terminal acknowledges what it took, so nothing arrives twice.
    await vi.waitFor(() =>
      expect(gateway.framesOf('ack').map((f) => f['seq'])).toEqual([1, 2]),
    );
  });

  it('ends on a final bye and says why', async () => {
    const remote = await open();
    const changes: unknown[] = [];
    remote.onChange((snapshot) => changes.push(snapshot));
    gateway.bye('revoked', 4003);
    await vi.waitFor(() => expect(remote.state).toBe('ended'));
    expect(remote.snapshot()).toEqual({
      state: 'ended',
      viewers: 0,
      reason: 'revoked',
    });
    expect(changes.at(-1)).toEqual({
      state: 'ended',
      viewers: 0,
      reason: 'revoked',
    });
  });

  it('leaves remote mode with close code 1000', async () => {
    const remote = await open();
    await remote.close();
    await vi.waitFor(() => expect(gateway.closeCodes).toEqual([1000]));
    expect(remote.state).toBe('ended');
    expect(remote.snapshot().reason).toBe('closed');
  });

  it('refuses to open past the plan’s ceiling, naming the live sessions', async () => {
    await gateway.close();
    gateway = await FakeGateway.start({
      onHello: () => ({
        type: 'bye',
        reason: 'limit',
        sessions: ['desk-a1', 'desk-b2'],
      }),
    });
    await expect(open()).rejects.toMatchObject({
      code: 'remote_refused',
      cause: { code: 'limit', sessions: ['desk-a1', 'desk-b2'] },
    });
  });
});

describe('trimToBudget', () => {
  it('keeps the newest items that fit the hello', () => {
    const big = { type: 'user', text: 'x'.repeat(REMOTE_HISTORY_BYTES / 2) };
    const small = { type: 'user', text: 'y' };
    expect(trimToBudget([big, big, small, big])).toEqual([small, big]);
    expect(trimToBudget([small])).toEqual([small]);
    expect(trimToBudget([])).toEqual([]);
  });
});
