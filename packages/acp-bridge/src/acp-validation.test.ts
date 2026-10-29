/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentSideConnection, type Agent } from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryChannel } from './inMemoryChannel.js';

describe('ACP request validation', () => {
  it('returns invalid params for an invalid initialize request', async () => {
    const channel = createInMemoryChannel();
    const initialize = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    new AgentSideConnection(
      () => ({ initialize }) as unknown as Agent,
      channel.agentStream,
    );
    const writer = channel.clientStream.writable.getWriter();
    const reader = channel.clientStream.readable.getReader();
    try {
      await writer.write({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      });
      const { value } = await reader.read();
      expect(value).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'Invalid params' },
      });
      expect(initialize).not.toHaveBeenCalled();
    } finally {
      writer.releaseLock();
      reader.releaseLock();
      channel.abort();
      consoleError.mockRestore();
    }
  });
});
