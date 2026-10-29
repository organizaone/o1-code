/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool definition helper for SDK-embedded MCP servers
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z, ZodRawShape, ZodObject } from 'zod';
/* eslint-disable import/no-internal-modules -- Zod exposes this public compatibility entry point. */
import type {
  z as z3,
  ZodRawShape as Zod3RawShape,
  ZodObject as Zod3Object,
} from 'zod/v3';
/* eslint-enable import/no-internal-modules */

type ToolShape = ZodRawShape | Zod3RawShape;
type ToolInput<Schema extends ToolShape> = Schema extends ZodRawShape
  ? z.infer<ZodObject<Schema>>
  : Schema extends Zod3RawShape
    ? z3.infer<Zod3Object<Schema>>
    : never;

/**
 * SDK MCP Tool Definition with Zod schema type inference
 */
export type SdkMcpToolDefinition<Schema extends ToolShape = ToolShape> = {
  name: string;
  description: string;
  inputSchema: Schema;
  handler: (args: ToolInput<Schema>, extra: unknown) => Promise<CallToolResult>;
};

/**
 * Create an SDK MCP tool definition with Zod schema inference
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { tool } from '@organizaone/o1-code-sdk';
 *
 * const calculatorTool = tool(
 *   'calculate_sum',
 *   'Calculate the sum of two numbers',
 *   { a: z.number(), b: z.number() },
 *   async (args) => {
 *     // args is inferred as { a: number, b: number }
 *     return { content: [{ type: 'text', text: String(args.a + args.b) }] };
 *   }
 * );
 * ```
 */
export function tool<Schema extends ToolShape>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (args: ToolInput<Schema>, extra: unknown) => Promise<CallToolResult>,
): SdkMcpToolDefinition<Schema> {
  if (!name || typeof name !== 'string') {
    throw new Error('Tool name must be a non-empty string');
  }

  if (!description || typeof description !== 'string') {
    throw new Error(`Tool '${name}' must have a description (string)`);
  }

  if (!inputSchema || typeof inputSchema !== 'object') {
    throw new Error(`Tool '${name}' must have an inputSchema (object)`);
  }

  if (!handler || typeof handler !== 'function') {
    throw new Error(`Tool '${name}' must have a handler (function)`);
  }

  return { name, description, inputSchema, handler };
}

export function validateToolName(name: string): void {
  if (!name) {
    throw new Error('Tool name cannot be empty');
  }

  if (name.length > 64) {
    throw new Error(
      `Tool name '${name}' is too long (max 64 characters): ${name.length}`,
    );
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Tool name '${name}' is invalid. Must start with a letter and contain only letters, numbers, and underscores.`,
    );
  }
}
