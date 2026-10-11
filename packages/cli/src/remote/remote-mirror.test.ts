/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Config } from '@organizaone/o1-code-core';
import { RemoteMirrorSink } from './remote-mirror.js';

const config = {
  getSessionId: () => 'sess-1',
  getModel: () => 'm',
  getContentGeneratorConfig: () => undefined,
} as unknown as Config;

describe('RemoteMirrorSink', () => {
  it('hands each stream-json line to the session as one event', () => {
    const sent: unknown[] = [];
    const sink = new RemoteMirrorSink(config, {
      state: 'online',
      send: (ev) => sent.push(ev),
    });
    expect(sink.isConnected).toBe(true);
    sink.emitUserMessage([{ text: 'hi' }]);
    sink.emitSystemMessage('note', { a: 1 });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      type: 'user',
      session_id: 'sess-1',
      message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    });
    expect(sent[1]).toMatchObject({ type: 'system', subtype: 'note' });
  });

  it('is disconnected once the session ended, and never mirrors permission frames', () => {
    const sent: unknown[] = [];
    const sink = new RemoteMirrorSink(config, {
      state: 'ended',
      send: (ev) => sent.push(ev),
    });
    expect(sink.isConnected).toBe(false);
    sink.emitPermissionRequest();
    sink.emitControlResponse();
    expect(sent).toEqual([]);
  });
});
