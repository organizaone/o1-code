/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import { DualOutputFanout } from '../dualOutput/dual-output-fanout.js';
import { FakeGateway } from './fake-gateway.js';
import { RemoteController, type RemoteEvent } from './remote-controller.js';
import type { RemoteEligibility } from './eligibility.js';

let gateway: FakeGateway;
let controller: RemoteController | null = null;
const updateSessionRegistryRemote = vi.fn().mockResolvedValue(undefined);

function config(over: Partial<Config> = {}): Config {
  return {
    getSessionId: () => 'sess-1',
    getTargetDir: () => '/w/app',
    getApprovalMode: () => 'default',
    getModel: () => 'claude-haiku-4-5',
    getCliVersion: () => '0.15.0',
    isRemoteEnabled: () => true,
    getRemoteSessionName: () => undefined,
    getContentGeneratorConfig: () => undefined,
    updateSessionRegistryRemote,
    ...over,
  } as unknown as Config;
}

function make(
  eligibility?: RemoteEligibility,
  over: Partial<Config> = {},
): { controller: RemoteController; sinks: DualOutputFanout } {
  const sinks = new DualOutputFanout();
  controller = new RemoteController({
    config: config(over),
    version: '0.15.0',
    sinks,
    checkEligibility: async () =>
      eligibility ?? {
        status: 'ok',
        transport: { kind: 'direct', baseUrl: gateway.baseUrl, apiKey: 'dk' },
        limits: { maxSessions: 3, maxViewers: 2 },
      },
  });
  return { controller, sinks };
}

beforeEach(async () => {
  gateway = await FakeGateway.start();
  updateSessionRegistryRemote.mockClear();
});

afterEach(async () => {
  await controller?.stop();
  controller = null;
  await gateway.close();
});

describe('RemoteController', () => {
  it('starts remote mode: hello, registry, status, and the mirror on the fan-out', async () => {
    const { controller, sinks } = make();
    const events: RemoteEvent[] = [];
    controller.onEvent((event) => events.push(event));
    controller.setHistoryProvider(() => [{ type: 'user' }]);

    const outcome = await controller.start();
    expect(outcome).toMatchObject({ status: 'started', remoteId: 'rm_test' });
    expect(gateway.hellos[0]).toMatchObject({
      session_id: 'sess-1',
      name: expect.stringMatching(/^.+-sess$/),
      cwd_hint: '/w/app',
      o1code_version: '0.15.0',
      approval_mode: 'default',
      model: 'claude-haiku-4-5',
      history: [{ type: 'user' }],
    });
    expect(updateSessionRegistryRemote).toHaveBeenCalledWith({
      id: 'rm_test',
      since: expect.any(Number),
    });
    expect(events[0]).toMatchObject({ kind: 'started', remoteId: 'rm_test' });
    expect(controller.status()).toMatchObject({
      active: true,
      remoteId: 'rm_test',
      snapshot: { state: 'online', viewers: 0 },
    });
    await vi.waitFor(() =>
      expect(gateway.framesOf('status')[0]).toMatchObject({ state: 'idle' }),
    );

    expect(sinks.isConnected).toBe(true);
    const event = gateway.next('event');
    sinks.emitUserMessage([{ text: 'hello from the terminal' }]);
    expect((await event)['ev']).toMatchObject({
      type: 'user',
      message: { content: [{ type: 'text', text: 'hello from the terminal' }] },
    });

    await expect(controller.start()).resolves.toEqual({
      status: 'active',
      url: expect.stringContaining('rm_test'),
    });
  });

  it('hands a viewer’s input and commands to the UI listeners', async () => {
    const { controller } = make();
    const input = vi.fn();
    const command = vi.fn();
    controller.onInput(input);
    controller.onCommand(command);
    await controller.start();
    gateway.send({ type: 'input', from: 'v1', id: 'i1', text: 'go' });
    gateway.send({ type: 'command', from: 'v1', id: 'c1', name: 'compact' });
    await vi.waitFor(() => expect(command).toHaveBeenCalled());
    expect(input).toHaveBeenCalledWith(expect.objectContaining({ text: 'go' }));
    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'compact' }),
    );
  });

  it('leaves remote mode on stop: mirror off, registry cleared, close code 1000', async () => {
    const { controller, sinks } = make();
    const events: RemoteEvent[] = [];
    controller.onEvent((event) => events.push(event));
    await controller.start();
    await controller.stop();
    expect(sinks.isConnected).toBe(false);
    expect(updateSessionRegistryRemote).toHaveBeenLastCalledWith(undefined);
    expect(controller.status()).toMatchObject({
      active: false,
      last: { state: 'ended', reason: 'closed' },
    });
    expect(events.at(-1)).toEqual({ kind: 'stopped', reason: 'closed' });
    await vi.waitFor(() => expect(gateway.closeCodes).toEqual([1000]));
  });

  it('leaves remote mode when the gateway ends the session, and says why', async () => {
    const { controller, sinks } = make();
    const events: RemoteEvent[] = [];
    controller.onEvent((event) => events.push(event));
    await controller.start();
    gateway.bye('revoked', 4003);
    await vi.waitFor(() => expect(controller.status().active).toBe(false));
    expect(controller.status().last).toEqual({
      state: 'ended',
      viewers: 0,
      reason: 'revoked',
    });
    expect(events.at(-1)).toEqual({ kind: 'stopped', reason: 'revoked' });
    expect(sinks.isConnected).toBe(false);
  });

  it('reports why it cannot start without opening anything', async () => {
    const { controller } = make({ status: 'plan' });
    await expect(controller.start()).resolves.toEqual({ status: 'plan' });
    expect(gateway.hellos).toHaveLength(0);

    const off = make(undefined, { isRemoteEnabled: () => false });
    await expect(off.controller.start()).resolves.toEqual({
      status: 'disabled',
    });
  });

  it('reports a refusal with the gateway’s code and the live sessions', async () => {
    await gateway.close();
    gateway = await FakeGateway.start({
      onHello: () => ({ type: 'bye', reason: 'limit', sessions: ['desk-a1'] }),
    });
    const { controller } = make();
    await expect(controller.start()).resolves.toMatchObject({
      status: 'refused',
      code: 'limit',
      sessions: ['desk-a1'],
    });
    expect(controller.status().active).toBe(false);
  });

  it('renames by saying hello again under the new name', async () => {
    const { controller } = make();
    await controller.start();
    await expect(controller.rename('phone-side')).resolves.toMatchObject({
      status: 'started',
    });
    expect(gateway.hellos.at(-1)).toMatchObject({ name: 'phone-side' });
    expect(controller.status().name).toBe('phone-side');
  });
});
