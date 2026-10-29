/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CLIMcpServerConfigSchema,
  McpOAuthConfigSchema,
  QueryOptionsSchema,
  SubagentConfigSchema,
} from '../../src/types/queryOptionsSchema.js';
import { workspaceWriteTools } from '../../src/daemon-mcp/serve-bridge/tools/workspaceWrite.js';

describe('SDK option array limits', () => {
  it.each([
    'coreTools',
    'excludeTools',
    'allowedTools',
    'includeDirectories',
    'extraArgs',
    'extensions',
    'allowedMcpServerNames',
    'disabledSlashCommands',
  ])(
    'accepts 10,000 values and rejects a larger %s array before parsing items',
    (key) => {
      expect(
        QueryOptionsSchema.safeParse({ [key]: Array(10_000).fill('ok') })
          .success,
      ).toBe(true);
      const result = QueryOptionsSchema.safeParse({
        [key]: Array(10_001).fill(null),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0]).toMatchObject({
          code: 'too_big',
          path: [key],
        });
      }
    },
  );

  it('bounds nested MCP configuration arrays', () => {
    const result = CLIMcpServerConfigSchema.safeParse({
      args: Array(10_001).fill(null),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]).toMatchObject({
        code: 'too_big',
        path: ['args'],
      });
    }
  });

  it('bounds agents, agent tools and OAuth scopes before parsing items', () => {
    const tooMany = Array(10_001).fill(null);
    const results = [
      QueryOptionsSchema.safeParse({ agents: tooMany }),
      SubagentConfigSchema.safeParse({
        name: 'agent',
        description: 'agent',
        systemPrompt: 'prompt',
        tools: tooMany,
      }),
      McpOAuthConfigSchema.safeParse({ scopes: tooMany }),
      McpOAuthConfigSchema.safeParse({ audiences: tooMany }),
    ];
    for (const result of results) {
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0]?.code).toBe('too_big');
      }
    }
  });

  it('rejects excessive tools in an agent passed through query options', () => {
    const result = QueryOptionsSchema.safeParse({
      agents: [
        {
          name: 'agent',
          description: 'agent',
          systemPrompt: 'prompt',
          tools: Array(10_001).fill('tool'),
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it.each(['tools', 'disallowed_tools'])(
    'bounds %s in the workspace agent MCP tool',
    (key) => {
      const tools = workspaceWriteTools(
        {} as Parameters<typeof workspaceWriteTools>[0],
      ) as Array<{ name: string; inputSchema: z.ZodRawShape }>;
      const schema = tools.find(
        (tool) => tool.name === 'workspace_agents_manage',
      )?.inputSchema;
      expect(schema).toBeDefined();
      const result = z.object(schema!).safeParse({
        action: 'create',
        [key]: Array(10_001).fill(null),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0]).toMatchObject({
          code: 'too_big',
          path: [key],
        });
      }
    },
  );
});
