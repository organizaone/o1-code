/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ReportProgressTool,
  registerAgentProgressTool,
} from './report-progress.js';
import { BackgroundTaskRegistry } from '../agents/background-tasks.js';
import { runWithAgentContext } from '../agents/runtime/agent-context.js';
import type { Config } from '../config/config.js';
import { AgentCore } from '../agents/runtime/agent-core.js';
import { ToolNames } from './tool-names.js';
import { ToolRegistry } from './tool-registry.js';
import { PermissionManager } from '../permissions/permission-manager.js';

describe('ReportProgressTool', () => {
  function setup() {
    const registry = new BackgroundTaskRegistry();
    for (const agentId of ['a', 'b']) {
      registry.register({
        agentId,
        description: agentId,
        status: 'running',
        startTime: 1,
        abortController: new AbortController(),
        isBackgrounded: true,
        outputFile: '/tmp/test.jsonl',
      });
    }
    const config = {
      getBackgroundTaskRegistry: () => registry,
      getMaxSubagentDepth: () => 3,
      getToolRegistry: () => ({
        warmAll: async () => {},
        getFunctionDeclarations: () => [
          tool.schema,
          { name: ToolNames.TODO_WRITE },
        ],
        getFunctionDeclarationsFiltered: (names: string[]) =>
          [tool.schema, { name: ToolNames.TODO_WRITE }].filter((item) =>
            names.includes(item.name!),
          ),
      }),
    } as unknown as Config;
    const tool = new ReportProgressTool(config);
    return { registry, tool, config };
  }

  it('records and clears only the calling agent declared plan', async () => {
    const { registry, tool, config } = setup();
    const todos = [
      {
        id: 'inspect',
        content: 'Inspect source',
        status: 'in_progress' as const,
      },
    ];
    const core = new AgentCore('a', config, {}, {}, {}, { tools: ['*'] });
    const result = await runWithAgentContext('a', async () => {
      const declarations = await core.prepareTools();
      expect(declarations.map((item) => item.name)).toContain(
        ToolNames.REPORT_PROGRESS,
      );
      expect(declarations.map((item) => item.name)).not.toContain(
        ToolNames.TODO_WRITE,
      );
      return tool.build({ todos }).execute(new AbortController().signal);
    });
    expect(result.error).toBeUndefined();
    expect(registry.get('a')?.todoItems).toEqual(todos);
    expect(registry.get('b')?.todoItems).toBeUndefined();
    await runWithAgentContext('a', () =>
      tool.build({ todos: [] }).execute(new AbortController().signal),
    );
    expect(registry.get('a')?.todoItems).toEqual([]);
  });

  it('refuses parent sessions, unknown owners, terminal agents and aborted execution', async () => {
    const { registry, tool } = setup();
    expect(
      (await tool.build({ todos: [] }).execute(new AbortController().signal))
        .error,
    ).toBeDefined();
    const missing = await runWithAgentContext('missing', () =>
      tool.build({ todos: [] }).execute(new AbortController().signal),
    );
    expect(missing.error).toBeDefined();
    registry.complete('a', 'done');
    const terminal = await runWithAgentContext('a', () =>
      tool.build({ todos: [] }).execute(new AbortController().signal),
    );
    expect(terminal.error).toBeDefined();
    const abort = new AbortController();
    abort.abort();
    const cancelled = await runWithAgentContext('b', () =>
      tool.build({ todos: [] }).execute(abort.signal),
    );
    expect(cancelled.error).toBeDefined();
    expect(registry.get('a')?.todoItems).toBeUndefined();
    expect(registry.get('b')?.todoItems).toBeUndefined();
  });

  it('rejects malformed plan data before execution', () => {
    const { tool } = setup();
    expect(() =>
      tool.build({ todos: [{ id: 'x', content: '', status: 'pending' }] }),
    ).toThrow();
  });

  it.each([
    { tools: [ToolNames.READ_FILE] },
    { tools: ['*'], disallowedTools: [ToolNames.REPORT_PROGRESS] },
  ])('respects configured agent tool restrictions %j', async (toolConfig) => {
    const { config } = setup();
    const core = new AgentCore('a', config, {}, {}, {}, toolConfig);
    const declarations = await runWithAgentContext('a', () =>
      core.prepareTools(),
    );
    expect(declarations.map((item) => item.name)).not.toContain(
      ToolNames.REPORT_PROGRESS,
    );
  });
});

describe('agent progress registration permissions', () => {
  function setupPolicy(
    options: {
      eagerTools?: string[];
      coreTools?: string[];
      deny?: string[];
    } = {},
  ) {
    const manager = new PermissionManager({
      getPermissionsAllow: () => [],
      getPermissionsAsk: () => [],
      getPermissionsDeny: () => options.deny,
      getEagerTools: () => options.eagerTools,
      getCoreTools: () => options.coreTools,
    });
    manager.initialize();
    const config = {
      getPermissionManager: () => manager,
      getMcpTransportPool: () => undefined,
      getDisabledTools: () => new Set<string>(),
      getVisibleTools: () => new Set<string>(),
      getToolRegistry: () => registry,
    } as unknown as Config;
    const registry = new ToolRegistry(config);
    return { config, registry, manager };
  }

  it('defers an unlisted tool under the eager allowlist while keeping it discoverable', async () => {
    const { config, registry } = setupPolicy({ eagerTools: ['Read'] });
    await registerAgentProgressTool(config);
    await registry.warmAll({ strict: true });
    expect(registry.getAllToolNames()).toContain(ToolNames.REPORT_PROGRESS);
    expect(
      registry.getFunctionDeclarations().map((item) => item.name),
    ).not.toContain(ToolNames.REPORT_PROGRESS);
    expect(registry.isPermissionDeferred(ToolNames.REPORT_PROGRESS)).toBe(true);
    expect(registry.isDeferredAndHidden(ToolNames.REPORT_PROGRESS)).toBe(true);
  });

  it.each([
    { coreTools: ['Read'] },
    { deny: ['report_progress'] },
    { deny: ['Progress'] },
  ])('does not register progress excluded by policy %j', async (options) => {
    const { config, registry } = setupPolicy(options);
    await registerAgentProgressTool(config);
    expect(registry.getAllToolNames()).not.toContain(ToolNames.REPORT_PROGRESS);
  });

  it('skips registration when the scoped permission manager fails', async () => {
    const { config, registry, manager } = setupPolicy();
    vi.spyOn(manager, 'getToolRegistrationStatus').mockRejectedValueOnce(
      new Error('policy unavailable'),
    );
    await registerAgentProgressTool(config);
    expect(registry.getAllToolNames()).not.toContain(ToolNames.REPORT_PROGRESS);
  });

  it('registers an explicitly allowed progress tool eagerly', async () => {
    const { config, registry } = setupPolicy({
      coreTools: ['Progress'],
      eagerTools: ['Progress'],
    });
    await registerAgentProgressTool(config);
    await registry.warmAll({ strict: true });
    expect(
      registry.getFunctionDeclarations().map((item) => item.name),
    ).toContain(ToolNames.REPORT_PROGRESS);
  });
});
