/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { TodoItem } from '../hooks/types.js';
import { getCurrentAgentId } from '../agents/runtime/agent-context.js';
import { normalizeAgentTodoItems } from '../agents/agent-todos.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import type { ToolRegistrationStatus } from '../permissions/permission-manager.js';

const debugLogger = createDebugLogger('REPORT_PROGRESS');

export interface ReportProgressParams {
  todos: TodoItem[];
}

class ReportProgressInvocation extends BaseToolInvocation<
  ReportProgressParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ReportProgressParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return 'Update agent progress';
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const agentId = getCurrentAgentId();
    const registry = this.config.getBackgroundTaskRegistry();
    const todos = normalizeAgentTodoItems(this.params.todos);
    if (
      signal.aborted ||
      !agentId ||
      registry.get(agentId)?.status !== 'running' ||
      !todos
    ) {
      const message =
        'Progress can only be reported by a running agent for its own task.';
      return {
        llmContent: message,
        returnDisplay: message,
        error: { message },
      };
    }
    registry.updateTodoItems(agentId, todos);
    return {
      llmContent:
        'Your declared progress was recorded. Task completion is still determined by the task result.',
      returnDisplay: { type: 'todo_list', todos },
    };
  }
}

export class ReportProgressTool extends BaseDeclarativeTool<
  ReportProgressParams,
  ToolResult
> {
  constructor(private readonly config: Config) {
    super(
      ToolNames.REPORT_PROGRESS,
      ToolDisplayNames.REPORT_PROGRESS,
      "Optionally report a concise list of your own task steps for the agent dashboard. Use pending, in_progress, or completed only to describe explicitly recorded progress. Replace the whole list; [] clears it. This does not modify the caller's todo list or approve or verify completion.",
      Kind.Think,
      {
        type: 'object',
        additionalProperties: false,
        required: ['todos'],
        properties: {
          todos: {
            type: 'array',
            maxItems: 100,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'content', 'status'],
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 500 },
                content: { type: 'string', minLength: 1, maxLength: 4000 },
                status: {
                  type: 'string',
                  enum: ['pending', 'in_progress', 'completed'],
                },
                blockedBy: {
                  type: 'array',
                  uniqueItems: true,
                  maxItems: 100,
                  items: { type: 'string', maxLength: 500 },
                },
              },
            },
          },
        },
      },
    );
  }

  override validateToolParams(params: ReportProgressParams): string | null {
    return normalizeAgentTodoItems(params.todos)
      ? null
      : 'Invalid agent progress items.';
  }

  protected createInvocation(params: ReportProgressParams) {
    return new ReportProgressInvocation(this.config, params);
  }
}

export async function registerAgentProgressTool(config: Config): Promise<void> {
  let status: ToolRegistrationStatus;
  try {
    const manager = config.getPermissionManager();
    status = manager
      ? await manager.getToolRegistrationStatus(ToolNames.REPORT_PROGRESS)
      : 'registered';
  } catch (error) {
    debugLogger.warn(
      'Failed to check agent progress permissions, skipping registration:',
      error,
    );
    return;
  }
  const registry = config.getToolRegistry();
  const factory = async () => new ReportProgressTool(config);
  if (status === 'deferred') {
    registry.registerPermissionDeferredFactory(
      ToolNames.REPORT_PROGRESS,
      factory,
    );
  } else if (status === 'registered') {
    registry.registerFactory(ToolNames.REPORT_PROGRESS, factory);
  }
}
