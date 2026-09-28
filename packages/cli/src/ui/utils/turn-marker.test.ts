/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getLiveTurn } from './turn-marker.js';
import { StreamingState, type HistoryItem } from '../types.js';

const user = (id: number, extra: Partial<HistoryItem> = {}): HistoryItem =>
  ({ id, type: 'user', text: `prompt ${id}`, ...extra }) as HistoryItem;
const reply = (id: number): HistoryItem =>
  ({ id, type: 'gemini', text: 'reply' }) as HistoryItem;

describe('getLiveTurn', () => {
  it('is null while idle', () => {
    expect(getLiveTurn(StreamingState.Idle, [user(1)], [])).toBeNull();
  });

  it('waits on the message that started the turn while nothing has arrived', () => {
    expect(
      getLiveTurn(StreamingState.Responding, [reply(1), user(2)], []),
    ).toEqual({ itemId: 2, marker: 'waiting' });
  });

  it('runs once a pending item shows under the message', () => {
    expect(
      getLiveTurn(
        StreamingState.Responding,
        [user(2)],
        [{ type: 'gemini', text: 'partial' } as never],
      ),
    ).toEqual({ itemId: 2, marker: 'running' });
  });

  it('runs once an item is committed after the message', () => {
    expect(
      getLiveTurn(
        StreamingState.WaitingForConfirmation,
        [user(2), reply(3)],
        [],
      ),
    ).toEqual({ itemId: 2, marker: 'running' });
  });

  it('skips steer messages, which never start a turn', () => {
    expect(
      getLiveTurn(
        StreamingState.Responding,
        [user(2), user(3, { sentToModel: false })],
        [],
      ),
    ).toEqual({ itemId: 2, marker: 'running' });
  });

  it('never re-animates a message whose turn already ended', () => {
    expect(
      getLiveTurn(
        StreamingState.Responding,
        [user(2, { turnOutcome: 'done' }), reply(3)],
        [],
      ),
    ).toBeNull();
  });

  it('is null for a turn without a user message', () => {
    expect(getLiveTurn(StreamingState.Responding, [reply(1)], [])).toBeNull();
  });
});
