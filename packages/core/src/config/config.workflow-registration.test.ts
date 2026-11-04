/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// Shared mocks needed by Config constructor.
vi.mock('node:fs');
vi.mock('node:fs/promises');
vi.mock('../telemetry/index.js', () => ({
  O1CodeLogger: vi.fn().mockImplementation(() => ({
    logStartSessionEvent: vi.fn().mockResolvedValue(undefined),
    logEndSessionEvent: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
  DEFAULT_TELEMETRY_TARGET: 'none',
  DEFAULT_OTLP_ENDPOINT: '',
  DEFAULT_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH: 1024 * 1024,
  SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH_LIMIT: 100 * 1024 * 1024,
  isTelemetrySdkInitialized: vi.fn().mockReturnValue(false),
  shutdownTelemetry: vi.fn().mockResolvedValue(undefined),
  refreshSessionContext: vi.fn(),
}));
vi.mock('../core/contentGenerator.js', () => ({
  resolveContentGeneratorConfigWithSources: vi.fn().mockReturnValue({
    config: { model: 'test-model', apiKey: 'test-key' },
    sources: {},
  }),
  createContentGeneratorConfig: vi.fn().mockReturnValue({}),
  createContentGenerator: vi.fn().mockReturnValue({}),
  AuthType: { API_KEY: 'apiKey' },
}));
vi.mock('../core/baseLlmClient.js');
vi.mock('../core/toolHookTriggers.js', () => ({
  fireNotificationHook: vi.fn().mockResolvedValue({}),
}));
vi.mock('../services/skillManager.js', () => {
  const SkillManagerMock = vi.fn();
  SkillManagerMock.prototype.startWatching = vi
    .fn()
    .mockResolvedValue(undefined);
  SkillManagerMock.prototype.refreshCache = vi
    .fn()
    .mockResolvedValue(undefined);
  SkillManagerMock.prototype.stopWatching = vi.fn();
  SkillManagerMock.prototype.listSkills = vi.fn().mockResolvedValue([]);
  SkillManagerMock.prototype.addChangeListener = vi.fn();
  SkillManagerMock.prototype.removeChangeListener = vi.fn();
  SkillManagerMock.prototype.matchAndActivateByPath = vi
    .fn()
    .mockResolvedValue([]);
  SkillManagerMock.prototype.matchAndActivateByPaths = vi
    .fn()
    .mockResolvedValue([]);
  return { SkillManager: SkillManagerMock };
});
vi.mock('../subagents/subagent-manager.js', () => {
  const SubagentManagerMock = vi.fn();
  SubagentManagerMock.prototype.loadSessionSubagents = vi.fn();
  SubagentManagerMock.prototype.addChangeListener = vi
    .fn()
    .mockReturnValue(() => {});
  SubagentManagerMock.prototype.listSubagents = vi.fn().mockResolvedValue([]);
  return { SubagentManager: SubagentManagerMock };
});
vi.mock('../ide/ide-client.js', () => ({
  IdeClient: {
    getInstance: vi.fn().mockResolvedValue({
      getConnectionStatus: vi.fn(),
      initialize: vi.fn(),
      shutdown: vi.fn(),
    }),
  },
}));
vi.mock('../utils/memory-constants.js', () => ({
  setMemoryFilename: vi.fn(),
}));

import * as fs from 'node:fs';
import type { ConfigParameters } from './config.js';
import { Config } from './config.js';
import { ToolNames } from '../tools/tool-names.js';

const baseParams: ConfigParameters = {
  cwd: '/tmp',
  targetDir: '/tmp',
  debugMode: false,
  model: 'test-model',
  telemetry: { enabled: false },
  usageStatisticsEnabled: false,
  overrideExtensions: [],
};

describe('WorkflowTool registration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readdirSync as Mock).mockReturnValue([]);
    (fs.statSync as Mock).mockReturnValue({
      isDirectory: vi.fn().mockReturnValue(true),
    });
    vi.mocked(fs.realpathSync).mockImplementation((p) => String(p));
    (fs.mkdirSync as Mock).mockImplementation(() => undefined);
    (fs.writeFileSync as Mock).mockImplementation(() => undefined);
    (fs.renameSync as Mock).mockImplementation(() => undefined);
    (fs.copyFileSync as Mock).mockImplementation(() => undefined);
    (fs.unlinkSync as Mock).mockImplementation(() => undefined);
    (fs.readFileSync as Mock).mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const key of ['O1CODE_ENABLE_WORKFLOWS', 'O1CODE_DISABLE_WORKFLOWS']) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('is NOT registered when isWorkflowsEnabled() is false', async () => {
    delete process.env['O1CODE_ENABLE_WORKFLOWS'];
    delete process.env['O1CODE_DISABLE_WORKFLOWS'];
    const cfg = new Config({ ...baseParams });
    const registry = await cfg.createToolRegistry(undefined, {
      skipDiscovery: true,
    });
    expect(registry.getAllToolNames()).not.toContain(ToolNames.WORKFLOW);
  });

  it('is registered when isWorkflowsEnabled() is true', async () => {
    delete process.env['O1CODE_DISABLE_WORKFLOWS'];
    process.env['O1CODE_ENABLE_WORKFLOWS'] = '1';
    const cfg = new Config({ ...baseParams });
    const registry = await cfg.createToolRegistry(undefined, {
      skipDiscovery: true,
    });
    expect(registry.getAllToolNames()).toContain(ToolNames.WORKFLOW);
  });

  it('prepares the gateway declaration without enabling execution, then activates review without changing it', async () => {
    delete process.env['O1CODE_ENABLE_WORKFLOWS'];
    delete process.env['O1CODE_DISABLE_WORKFLOWS'];
    const cfg = new Config({ ...baseParams, trustedFolder: true });
    const registry = await cfg.createToolRegistry(undefined, {
      skipDiscovery: true,
    });
    vi.spyOn(cfg, 'getToolRegistry').mockReturnValue(registry);
    vi.spyOn(cfg, 'getContentGeneratorConfig').mockReturnValue({
      model: 'o1gw/account/copilot/2/gpt-6.1-sol',
      baseUrl: 'http://127.0.0.1:1/v1',
    });
    const setTools = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(cfg, 'getLlmClient').mockReturnValue({
      setTools,
    } as unknown as ReturnType<Config['getLlmClient']>);

    await cfg.prepareGatewayToolDeclarations();
    expect(cfg.getGatewayToolSnapshotPolicy()).toBe('gateway-v1');
    const workflow = await registry.ensureTool(ToolNames.WORKFLOW);
    expect(workflow).toBeDefined();
    expect(cfg.isWorkflowsEnabled()).toBe(false);
    expect(() => workflow!.build({ script: "return 'synthetic';" })).toThrow(
      'Workflows are not enabled',
    );
    const before = registry.getFunctionDeclarations({ includeDeferred: true });

    await cfg.enableReviewWorkflow();
    await cfg.enableReviewWorkflow();

    expect(cfg.isWorkflowsEnabled()).toBe(true);
    expect(registry.getFunctionDeclarations({ includeDeferred: true })).toEqual(
      before,
    );
    expect(
      registry.getAllToolNames().filter((name) => name === ToolNames.WORKFLOW),
    ).toHaveLength(1);
    expect(() =>
      workflow!.build({ script: "return 'synthetic';" }),
    ).not.toThrow();
  });

  it('O1CODE_DISABLE_WORKFLOWS=1 overrides enable-via-settings', async () => {
    process.env['O1CODE_DISABLE_WORKFLOWS'] = '1';
    delete process.env['O1CODE_ENABLE_WORKFLOWS'];
    const cfg = new Config({ ...baseParams });
    cfg.setWorkflowsEnabled(true);
    const registry = await cfg.createToolRegistry(undefined, {
      skipDiscovery: true,
    });
    expect(registry.getAllToolNames()).not.toContain(ToolNames.WORKFLOW);
  });

  it.each([
    { workflowsEnabled: false, trustedFolder: true },
    { trustedFolder: false },
    { bareMode: true, trustedFolder: true },
  ])(
    'does not reserve or activate review under restrictions %j',
    async (restrictions) => {
      delete process.env['O1CODE_ENABLE_WORKFLOWS'];
      delete process.env['O1CODE_DISABLE_WORKFLOWS'];
      const cfg = new Config({ ...baseParams, ...restrictions });
      const registry = await cfg.createToolRegistry(undefined, {
        skipDiscovery: true,
      });
      vi.spyOn(cfg, 'getToolRegistry').mockReturnValue(registry);
      vi.spyOn(cfg, 'getContentGeneratorConfig').mockReturnValue({
        model: 'o1gw/account/copilot/2/gpt-6.1-sol',
      });
      await cfg.prepareGatewayToolDeclarations();
      await cfg.enableReviewWorkflow();
      expect(registry.getAllToolNames()).not.toContain(ToolNames.WORKFLOW);
      expect(cfg.isWorkflowsEnabled()).toBe(false);
    },
  );

  it('does not reserve a denied workflow declaration', async () => {
    delete process.env['O1CODE_ENABLE_WORKFLOWS'];
    delete process.env['O1CODE_DISABLE_WORKFLOWS'];
    const cfg = new Config({ ...baseParams, trustedFolder: true });
    vi.spyOn(cfg, 'getDisabledTools').mockReturnValue(
      new Set([ToolNames.WORKFLOW]),
    );
    const registry = await cfg.createToolRegistry(undefined, {
      skipDiscovery: true,
    });
    vi.spyOn(cfg, 'getToolRegistry').mockReturnValue(registry);
    vi.spyOn(cfg, 'getContentGeneratorConfig').mockReturnValue({
      model: 'o1gw/account/copilot/2/gpt-6.1-sol',
    });
    await cfg.prepareGatewayToolDeclarations();
    await cfg.enableReviewWorkflow();
    expect(registry.getAllToolNames()).not.toContain(ToolNames.WORKFLOW);
    expect(cfg.isWorkflowsEnabled()).toBe(false);
  });

  it.each([true, undefined])(
    'restores only previously declared workflow reservations: %s',
    async (workflowToolDeclared) => {
      delete process.env['O1CODE_ENABLE_WORKFLOWS'];
      delete process.env['O1CODE_DISABLE_WORKFLOWS'];
      const cfg = new Config({ ...baseParams, trustedFolder: true });
      const registry = await cfg.createToolRegistry(undefined, {
        skipDiscovery: true,
      });
      vi.spyOn(cfg, 'getToolRegistry').mockReturnValue(registry);
      vi.spyOn(cfg, 'getContentGeneratorConfig').mockReturnValue({
        model: 'o1gw/account/copilot/2/gpt-6.1-sol',
      });
      vi.spyOn(cfg, 'getResumedSessionData').mockReturnValue({
        conversation: {
          messages: [
            {
              subtype: 'gateway_conversation',
              sessionId: cfg.getSessionId(),
              systemPayload: {
                actor: 'main',
                conversationId: cfg.getSessionId(),
                workflowToolDeclared,
              },
            },
          ],
        },
      } as unknown as NonNullable<ReturnType<Config['getResumedSessionData']>>);

      await cfg.prepareGatewayToolDeclarations();

      expect(cfg.getGatewayToolSnapshotPolicy()).toBe('legacy-eager-v1');
      expect(registry.getAllToolNames().includes(ToolNames.WORKFLOW)).toBe(
        workflowToolDeclared === true,
      );
      expect(cfg.isWorkflowsEnabled()).toBe(false);
    },
  );
});

// FIX-G (Round 4 test Important): regression test for the FIX-8 anti-recursion
// guard. A subagent spawned BY a workflow must not be able to call the
// Workflow tool again — that would create unbounded O(k^n) fan-out. Without
// this assertion, a rename of `ToolNames.WORKFLOW` or accidental deletion of
// the exclusion entry would silently open the recursion.
describe('Workflow anti-recursion guard', () => {
  it('ToolNames.WORKFLOW is in EXCLUDED_TOOLS_FOR_SUBAGENTS', async () => {
    const { EXCLUDED_TOOLS_FOR_SUBAGENTS } = await import(
      '../agents/runtime/agent-core.js'
    );
    expect(EXCLUDED_TOOLS_FOR_SUBAGENTS.has(ToolNames.WORKFLOW)).toBe(true);
  });

  it('artifact tools are in EXCLUDED_TOOLS_FOR_SUBAGENTS', async () => {
    const { EXCLUDED_TOOLS_FOR_SUBAGENTS } = await import(
      '../agents/runtime/agent-core.js'
    );
    expect(EXCLUDED_TOOLS_FOR_SUBAGENTS.has(ToolNames.ARTIFACT)).toBe(true);
    expect(EXCLUDED_TOOLS_FOR_SUBAGENTS.has(ToolNames.RECORD_ARTIFACT)).toBe(
      true,
    );
  });

  it('TodoWrite is in EXCLUDED_TOOLS_FOR_SUBAGENTS', async () => {
    const { EXCLUDED_TOOLS_FOR_SUBAGENTS } = await import(
      '../agents/runtime/agent-core.js'
    );
    expect(EXCLUDED_TOOLS_FOR_SUBAGENTS.has(ToolNames.TODO_WRITE)).toBe(true);
  });
});
