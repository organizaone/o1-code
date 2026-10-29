/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { z as z3 } from 'zod/v3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { tool } from '../../src/mcp/tool.js';
import { tool as daemonTool } from '../../src/daemon-mcp/tool.js';
import { createSdkMcpServer } from '../../src/mcp/createSdkMcpServer.js';
import { createSdkMcpServer as createDaemonMcpServer } from '../../src/daemon-mcp/createSdkMcpServer.js';

describe.each([
  ['embedded', tool, createSdkMcpServer],
  ['daemon', daemonTool, createDaemonMcpServer],
] as const)('%s MCP tool schema', (_kind, defineTool, createServer) => {
  it('preserves inferred input types for handlers', async () => {
    const definition = defineTool(
      'count',
      'Count items',
      { count: z.number(), label: z.string().optional() },
      async (args) => {
        expectTypeOf(args.count).toEqualTypeOf<number>();
        expectTypeOf(args.label).toEqualTypeOf<string | undefined>();
        return { content: [{ type: 'text', text: String(args.count) }] };
      },
    );
    const result = await definition.handler({ count: 2 }, undefined);
    expect(result.content).toEqual([{ type: 'text', text: '2' }]);
    const server = createServer({ name: 'test', tools: [definition] });
    const client = new Client({ name: 'test-client', version: '1' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.instance.connect(serverTransport);
      await client.connect(clientTransport);
      const remote = await client.callTool({
        name: 'count',
        arguments: { count: 3 },
      });
      expect(remote.content).toEqual([{ type: 'text', text: '3' }]);
      const invalid = await client.callTool({
        name: 'count',
        arguments: { count: 'bad' },
      });
      expect(invalid.isError).toBe(true);
    } finally {
      await client.close();
      await server.instance.close();
    }
  });

  it('accepts Zod 3 schemas with inferred types and validates calls through the server', async () => {
    const definition = defineTool(
      'legacy_count',
      'Count items',
      { count: z3.number(), label: z3.string().optional() },
      async (args) => {
        expectTypeOf(args.count).toEqualTypeOf<number>();
        expectTypeOf(args.label).toEqualTypeOf<string | undefined>();
        return { content: [{ type: 'text', text: String(args.count) }] };
      },
    );
    const server = createServer({ name: 'test', tools: [definition] });
    const client = new Client({ name: 'test-client', version: '1' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.instance.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: 'legacy_count',
        arguments: { count: 2 },
      });
      expect(result.content).toEqual([{ type: 'text', text: '2' }]);
      const invalid = await client.callTool({
        name: 'legacy_count',
        arguments: { count: 'bad' },
      });
      expect(invalid.isError).toBe(true);
    } finally {
      await client.close();
      await server.instance.close();
    }
  });

  it.each([
    ['Zod 3', { items: z3.array(z3.number()) }],
    ['Zod 4', { items: z.array(z.number()) }],
  ])(
    'limits tool input elements before validating %s schemas',
    async (_version, schema) => {
      const handler = vi.fn(async () => ({
        content: [{ type: 'text' as const, text: 'ok' }],
      }));
      const definition = defineTool('bounded', 'Bound input', schema, handler);
      const server = createServer({ name: 'test', tools: [definition] });
      const client = new Client({ name: 'test-client', version: '1' });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      try {
        await server.instance.connect(serverTransport);
        await client.connect(clientTransport);
        const accepted = await client.callTool({
          name: 'bounded',
          arguments: { items: [1, 2] },
        });
        expect(accepted.isError).not.toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        const rejected = await client.callTool({
          name: 'bounded',
          arguments: { items: Array(10_000).fill(1) },
        });
        expect(rejected.isError).toBe(true);
        expect(rejected.content).toEqual([
          expect.objectContaining({
            text: expect.stringContaining('maximum of 10000 elements'),
          }),
        ]);
        expect(handler).toHaveBeenCalledTimes(1);
      } finally {
        await client.close();
        await server.instance.close();
      }
    },
  );
});
