/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { getRecentSessions, primeRecentSessions } from './recent-sessions.js';

const mocks = vi.hoisted(() => ({ list: vi.fn(), count: vi.fn() }));
vi.mock('@organizaone/o1-code-core/services/sessionService.js', () => ({
  SessionService: class {
    listSessions = mocks.list;
    countSessionMessages = mocks.count;
  },
}));

describe('recent sessions', () => {
  it('checks named sessions with no prompt for messages without scanning normal conversations', async () => {
    mocks.list.mockResolvedValue({
      items: [
        { sessionId: 'empty', prompt: '', customTitle: 'Empty' },
        {
          sessionId: 'working',
          prompt: 'A real request',
          customTitle: 'Working',
        },
      ],
    });
    mocks.count.mockResolvedValue(0);
    await primeRecentSessions('/recent-session-count-test');
    expect(mocks.count).toHaveBeenCalledOnce();
    expect(mocks.count).toHaveBeenCalledWith('empty');
    expect(
      getRecentSessions('/recent-session-count-test')?.[0]?.messageCount,
    ).toBe(0);
  });
});
