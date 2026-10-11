/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { DualOutputFanout } from './dual-output-fanout.js';
import type { DualOutputSink } from './dual-output-sink.js';

function sink(connected = true): DualOutputSink & { calls: string[] } {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (..._args: unknown[]) => {
      calls.push(name);
    };
  return {
    calls,
    get isConnected() {
      return connected;
    },
    processEvent: record('processEvent'),
    startAssistantMessage: record('startAssistantMessage'),
    finalizeAssistantMessage: record('finalizeAssistantMessage'),
    emitUserMessage: record('emitUserMessage'),
    emitToolResult: record('emitToolResult'),
    emitPermissionRequest: record('emitPermissionRequest'),
    emitControlResponse: record('emitControlResponse'),
    emitControlError: record('emitControlError'),
    emitSystemMessage: record('emitSystemMessage'),
    shutdown: vi.fn(async () => {
      calls.push('shutdown');
    }),
  };
}

describe('DualOutputFanout', () => {
  it('is disconnected while empty and forwards to every connected sink', () => {
    const fanout = new DualOutputFanout();
    expect(fanout.isConnected).toBe(false);
    fanout.processEvent({ type: 'content', value: 'x' } as never);

    const a = sink();
    const b = sink(false);
    fanout.add(a);
    fanout.add(b);
    expect(fanout.isConnected).toBe(true);
    fanout.startAssistantMessage();
    fanout.emitUserMessage([{ text: 'hi' }]);
    fanout.emitPermissionRequest('r1', 'shell', 'c1', {});
    expect(a.calls).toEqual([
      'startAssistantMessage',
      'emitUserMessage',
      'emitPermissionRequest',
    ]);
    expect(b.calls).toEqual([]);
  });

  it('stops forwarding to a sink once it is removed', () => {
    const fanout = new DualOutputFanout();
    const a = sink();
    const remove = fanout.add(a);
    remove();
    fanout.finalizeAssistantMessage();
    expect(a.calls).toEqual([]);
    expect(fanout.isConnected).toBe(false);
  });

  it('shuts every sink down and empties itself', async () => {
    const fanout = new DualOutputFanout();
    const a = sink();
    const b = sink();
    fanout.add(a);
    fanout.add(b);
    await fanout.shutdown();
    expect(a.shutdown).toHaveBeenCalled();
    expect(b.shutdown).toHaveBeenCalled();
    expect(fanout.size).toBe(0);
  });
});
