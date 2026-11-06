/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { InputFormat, AuthType } from '@organizaone/o1-code-core';
import type { ContentGeneratorConfig } from '@organizaone/o1-code-core/core/contentGenerator.js';
import type { AvailableModel } from '@organizaone/o1-code-core/models/types.js';
import type { Content } from '@google/genai';
import { getGatewayAccountSelection } from '@organizaone/o1-code-core/providers/gateway-transfer.js';
import { createMinimalSettings } from '../../../config/settings.js';
import { getAvailableCommands } from '../../../nonInteractiveCliCommands.js';
import { CommandKind } from '../../../ui/commands/types.js';
import type { StreamJsonOutputAdapter } from '../../io/StreamJsonOutputAdapter.js';
import type { IControlContext } from '../ControlContext.js';
import type { IPendingRequestRegistry } from './baseController.js';
import { SystemController } from './systemController.js';

const { mockDebugLogger } = vi.hoisted(() => ({
  mockDebugLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@organizaone/o1-code-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@organizaone/o1-code-core')>()),
  createDebugLogger: () => mockDebugLogger,
}));

vi.mock('../../../nonInteractiveCliCommands.js', () => ({
  getAvailableCommands: vi.fn(),
}));

function createContext(
  overrides: Partial<IControlContext> = {},
): IControlContext {
  const abortController = new AbortController();

  return {
    config: {
      getDebugMode: vi.fn().mockReturnValue(false),
      getInputFormat: vi.fn().mockReturnValue(InputFormat.STREAM_JSON),
      setSdkMode: vi.fn(),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      addMcpServers: vi.fn(),
      setSessionSubagents: vi.fn(),
      setApprovalMode: vi.fn(),
      setModel: vi.fn(),
      setReasoningEffort: vi.fn(),
      getReasoningEffort: vi.fn().mockReturnValue(undefined),
      getReasoningEffortOverride: vi.fn().mockReturnValue(undefined),
      getAvailableModels: vi.fn().mockReturnValue([]),
    } as unknown as IControlContext['config'],
    streamJson: {
      send: vi.fn(),
    } as unknown as StreamJsonOutputAdapter,
    sessionId: 'test-session-id',
    abortSignal: abortController.signal,
    debugMode: false,
    settings: createMinimalSettings(),
    permissionMode: 'default',
    sdkCanUseToolTimeoutMs: undefined,
    sdkMcpServers: new Set<string>(),
    mcpClients: new Map(),
    inputClosed: false,
    ...overrides,
  };
}

function createRegistry(): IPendingRequestRegistry {
  return {
    registerIncomingRequest: vi.fn(),
    deregisterIncomingRequest: vi.fn(),
    registerOutgoingRequest: vi.fn(),
    deregisterOutgoingRequest: vi.fn(),
  };
}

describe('SystemController', () => {
  function gatewaySelection() {
    const source = 'o1gw/account/copilot/2/auto';
    const destination = 'o1gw/own/claude/7/sonnet';
    let sessionId = 'conversation-a';
    let active = false;
    const current: ContentGeneratorConfig = {
      model: source,
      authType: AuthType.USE_ANTHROPIC,
      baseUrl: 'https://gateway.example/v1',
      connection: 'o1-connect',
    };
    const history: Content[] = [
      { role: 'model', parts: [{ text: 'completed' }] },
    ];
    const catalog: AvailableModel[] = [
      {
        id: destination,
        label: destination,
        authType: AuthType.USE_OPENAI,
        baseUrl: current.baseUrl,
      },
    ];
    const config = {
      ...createContext().config,
      getSessionId: () => sessionId,
      getContentGeneratorConfig: () => current,
      getLlmClient: () => ({ getHistoryShallow: () => history }),
      getAllConfiguredModels: () => catalog,
      switchModel: vi.fn(async (authType, model) => {
        current.model = model;
        current.authType = authType;
      }),
    } as unknown as IControlContext['config'];
    const context = createContext({
      config,
      getActiveTurnAbortSignal: () =>
        active ? new AbortController().signal : undefined,
    });
    const controller = new SystemController(
      context,
      createRegistry(),
      'SystemController',
    );
    return {
      source,
      destination,
      current,
      history,
      catalog,
      config,
      controller,
      changeSession: () => {
        sessionId = 'conversation-b';
      },
      setActive: () => {
        active = true;
      },
    };
  }

  it('asks for one-time history consent before switching a configured account', async () => {
    const { source, destination, config, controller } = gatewaySelection();
    const pending = await controller.handleRequest(
      { subtype: 'set_model', model: destination },
      'ask',
    );
    expect(pending).toMatchObject({
      requires_confirmation: true,
      session_id: 'conversation-a',
      source_model: source,
      destination_model: destination,
      destination_base_url: 'https://gateway.example/v1',
      destination_auth_type: AuthType.USE_OPENAI,
    });
    expect(pending['message']).toContain('tokens and context');
    expect(config.switchModel).not.toHaveBeenCalled();
    const confirmation_id = String(pending['confirmation_id']);
    const request = {
      subtype: 'set_model' as const,
      model: destination,
      history_consent: { confirmation_id, confirmed: true },
    };
    await expect(
      controller.handleRequest(request, 'accept'),
    ).resolves.toMatchObject({ model: destination });
    expect(config.switchModel).toHaveBeenCalledWith(
      AuthType.USE_OPENAI,
      destination,
      { baseUrl: 'https://gateway.example/v1' },
    );
    expect(getGatewayAccountSelection(config)).toMatchObject({
      sourceModel: source,
      destinationModel: destination,
    });
    await expect(controller.handleRequest(request, 'replay')).rejects.toThrow(
      'authorization expired or changed',
    );
    expect(config.switchModel).toHaveBeenCalledOnce();
  });

  it.each([
    'cancel',
    'session',
    'source',
    'destination',
    'destination-endpoint',
    'destination-auth',
    'destination-env',
    'destination-credential',
    'busy',
    'pending-tool',
  ])('keeps the source when consent cannot be used: %s', async (scenario) => {
    const fixture = gatewaySelection();
    const { controller, config, destination, source } = fixture;
    const pending = await controller.handleRequest(
      { subtype: 'set_model', model: destination },
      'ask',
    );
    if (scenario === 'session') fixture.changeSession();
    if (scenario === 'source')
      fixture.current.apiKey = 'changed-disposable-key';
    if (scenario === 'destination-endpoint')
      fixture.catalog[0].baseUrl = 'https://another-gateway.example/v1';
    if (scenario === 'destination-auth')
      fixture.catalog[0].authType = AuthType.USE_ANTHROPIC;
    if (scenario === 'destination-env')
      fixture.catalog[0].envKey = 'CHANGED_DISPOSABLE_KEY';
    if (scenario === 'destination-credential')
      fixture.catalog[0].credential = 'changed-disposable-credential';
    if (scenario === 'busy') fixture.setActive();
    if (scenario === 'pending-tool')
      fixture.history.push({
        role: 'model',
        parts: [{ functionCall: { id: 'pending', name: 'shell', args: {} } }],
      });
    const request = {
      subtype: 'set_model' as const,
      model:
        scenario === 'destination' ? 'o1gw/own/claude/8/sonnet' : destination,
      history_consent: {
        confirmation_id: String(pending['confirmation_id']),
        confirmed: scenario !== 'cancel',
      },
    };
    if (scenario === 'cancel')
      await expect(
        controller.handleRequest(request, 'respond'),
      ).resolves.toMatchObject({ cancelled: true, model: source });
    else
      await expect(
        controller.handleRequest(request, 'respond'),
      ).rejects.toThrow();
    expect(config.switchModel).not.toHaveBeenCalled();
    expect(getGatewayAccountSelection(config)).toBeUndefined();
  });

  it('requires consent for user-only history after a refused request', async () => {
    const { controller, config, destination, history } = gatewaySelection();
    history.splice(0, history.length, {
      role: 'user',
      parts: [{ text: 'first request was refused' }],
    });
    await expect(
      controller.handleRequest(
        { subtype: 'set_model', model: destination },
        'ask',
      ),
    ).resolves.toMatchObject({ requires_confirmation: true });
    expect(config.switchModel).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'resolves duplicate route IDs only with an exact current endpoint and auth match: %s',
    async (matchesCurrent) => {
      const { controller, config, current, destination, catalog } =
        gatewaySelection();
      catalog.unshift({
        ...catalog[0],
        baseUrl: 'https://another-gateway.example/v1',
      });
      if (matchesCurrent) {
        current.authType = AuthType.USE_OPENAI;
        catalog[1].baseUrl = 'https://GATEWAY.example:443/v1/';
        // Gateway contract v2: the same endpoint and auth switch without a confirmation round trip.
        const result = await controller.handleRequest(
          { subtype: 'set_model', model: destination },
          'ask',
        );
        expect(result).not.toMatchObject({ requires_confirmation: true });
        expect(config.switchModel).toHaveBeenCalledOnce();
      } else {
        await expect(
          controller.handleRequest(
            { subtype: 'set_model', model: destination },
            'ask',
          ),
        ).rejects.toThrow('multiple configured destinations');
        expect(config.switchModel).not.toHaveBeenCalled();
      }
    },
  );

  it('loads supported commands with the session settings for Skill registration', async () => {
    const context = createContext();
    const controller = new SystemController(
      context,
      createRegistry(),
      'SystemController',
    );
    vi.mocked(getAvailableCommands).mockResolvedValueOnce([
      {
        name: 'demo:analysis',
        description: 'Analyze a local dataset',
        kind: CommandKind.FILE,
      },
    ]);

    const result = await controller.handleRequest(
      { subtype: 'supported_commands' },
      'supported-commands',
    );

    expect(result).toEqual({
      subtype: 'supported_commands',
      commands: ['demo:analysis'],
    });
    expect(getAvailableCommands).toHaveBeenCalledWith(
      context.config,
      expect.any(AbortSignal),
      'non_interactive',
      context.settings,
    );
  });

  describe('initialize timeout validation', () => {
    it('accepts valid timeout within bounds', async () => {
      const context = createContext();
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      await controller.handleRequest(
        {
          subtype: 'initialize',
          timeout: { canUseTool: 120_000 },
        },
        'test-1',
      );

      expect(context.sdkCanUseToolTimeoutMs).toBe(120_000);
    });

    it('accepts timeout at maximum boundary (600_000ms)', async () => {
      const context = createContext();
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      await controller.handleRequest(
        {
          subtype: 'initialize',
          timeout: { canUseTool: 600_000 },
        },
        'test-2',
      );

      expect(context.sdkCanUseToolTimeoutMs).toBe(600_000);
    });

    it('ignores timeout exceeding maximum boundary', async () => {
      const context = createContext();
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      await controller.handleRequest(
        {
          subtype: 'initialize',
          timeout: { canUseTool: 600_001 },
        },
        'test-3',
      );

      expect(context.sdkCanUseToolTimeoutMs).toBeUndefined();
    });

    it('ignores Number.MAX_VALUE timeout', async () => {
      const context = createContext();
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      await controller.handleRequest(
        {
          subtype: 'initialize',
          timeout: { canUseTool: Number.MAX_VALUE },
        },
        'test-4',
      );

      expect(context.sdkCanUseToolTimeoutMs).toBeUndefined();
    });

    it('ignores negative timeout', async () => {
      const context = createContext();
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      await controller.handleRequest(
        {
          subtype: 'initialize',
          timeout: { canUseTool: -1000 },
        },
        'test-5',
      );

      expect(context.sdkCanUseToolTimeoutMs).toBeUndefined();
    });

    it('ignores zero timeout', async () => {
      const context = createContext();
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      await controller.handleRequest(
        {
          subtype: 'initialize',
          timeout: { canUseTool: 0 },
        },
        'test-6',
      );

      expect(context.sdkCanUseToolTimeoutMs).toBeUndefined();
    });

    it('ignores Infinity timeout', async () => {
      const context = createContext();
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      await controller.handleRequest(
        {
          subtype: 'initialize',
          timeout: { canUseTool: Infinity },
        },
        'test-7',
      );

      expect(context.sdkCanUseToolTimeoutMs).toBeUndefined();
    });

    it('ignores NaN timeout', async () => {
      const context = createContext();
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      await controller.handleRequest(
        {
          subtype: 'initialize',
          timeout: { canUseTool: NaN },
        },
        'test-8',
      );

      expect(context.sdkCanUseToolTimeoutMs).toBeUndefined();
    });
  });

  describe('initialize MCP configuration', () => {
    it('preserves explicit automatic version negotiation', async () => {
      const context = createContext();
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      await controller.handleRequest(
        {
          subtype: 'initialize',
          mcpServers: {
            automatic: {
              command: 'node',
              versionNegotiation: 'auto',
            },
          },
        },
        'mcp-1',
      );

      expect(context.config.addMcpServers).toHaveBeenCalledWith({
        automatic: expect.objectContaining({
          command: 'node',
          versionNegotiation: 'auto',
        }),
      });
    });
  });

  describe('continue_last_turn', () => {
    it('delegates to the session callback and merges its payload', async () => {
      const onContinueLastTurn = vi.fn().mockResolvedValue({
        accepted: true,
        interruption: 'interrupted_turn',
      });
      const controller = new SystemController(
        createContext({ onContinueLastTurn }),
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'continue_last_turn' },
        'continue-1',
      );

      expect(onContinueLastTurn).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        subtype: 'continue_last_turn',
        accepted: true,
        interruption: 'interrupted_turn',
      });
    });

    it('fails loudly when no session callback is registered', async () => {
      const controller = new SystemController(
        createContext(),
        createRegistry(),
        'SystemController',
      );

      await expect(
        controller.handleRequest(
          { subtype: 'continue_last_turn' },
          'continue-2',
        ),
      ).rejects.toThrow(/was not registered on ControlContext/);
    });
  });

  describe('set_effort', () => {
    it('sets effort and returns applied=true when read-back matches', async () => {
      const context = createContext();
      (
        context.config.getReasoningEffort as ReturnType<typeof vi.fn>
      ).mockReturnValue('high');
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'set_effort', effort: 'high' },
        'effort-1',
      );

      expect(context.config.setReasoningEffort).toHaveBeenCalledWith('high');
      expect(result).toEqual({
        subtype: 'set_effort',
        effort: 'high',
        applied: true,
        override: null,
      });
    });

    it('returns applied=false when thinking is disabled (read-back mismatch)', async () => {
      const context = createContext();
      (
        context.config.getReasoningEffort as ReturnType<typeof vi.fn>
      ).mockReturnValue('medium');
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'set_effort', effort: 'high' },
        'effort-2',
      );

      expect(result).toEqual({
        subtype: 'set_effort',
        effort: 'high',
        applied: false,
        override: null,
      });
    });

    it('returns the higher-priority wire override', async () => {
      const context = createContext();
      (
        context.config.getReasoningEffort as ReturnType<typeof vi.fn>
      ).mockReturnValue('high');
      (
        context.config.getReasoningEffortOverride as ReturnType<typeof vi.fn>
      ).mockReturnValue({
        source: 'samplingParams',
        field: 'enable_thinking',
      });
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'set_effort', effort: 'high' },
        'effort-override',
      );

      expect(result).toEqual({
        subtype: 'set_effort',
        effort: 'high',
        applied: false,
        override: {
          source: 'samplingParams',
          field: 'enable_thinking',
        },
      });
    });

    it('rejects invalid effort value', async () => {
      const controller = new SystemController(
        createContext(),
        createRegistry(),
        'SystemController',
      );

      await expect(
        controller.handleRequest(
          { subtype: 'set_effort', effort: 'banana' },
          'effort-3',
        ),
      ).rejects.toThrow('Invalid effort value');
    });

    it('rejects empty effort string', async () => {
      const controller = new SystemController(
        createContext(),
        createRegistry(),
        'SystemController',
      );

      await expect(
        controller.handleRequest(
          { subtype: 'set_effort', effort: '  ' },
          'effort-4',
        ),
      ).rejects.toThrow('Invalid effort specified');
    });
  });

  describe('get_available_models', () => {
    it('returns models without exposing baseUrl or envKey', async () => {
      const context = createContext();
      (
        context.config.getAvailableModels as ReturnType<typeof vi.fn>
      ).mockReturnValue([
        {
          id: 'qwen-max',
          label: 'Qwen Max',
          capabilities: { vision: true },
          contextWindowSize: 128000,
          baseUrl: 'https://internal-proxy.corp/v1',
          envKey: 'SECRET_API_KEY',
        },
        {
          id: 'qwen-image-2.0',
          label: 'Qwen Image 2.0',
          imageOnly: true,
        },
      ]);
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'get_available_models' },
        'models-1',
      );

      expect(result).toEqual({
        subtype: 'get_available_models',
        models: [
          {
            id: 'qwen-max',
            label: 'Qwen Max',
            capabilities: { vision: true },
            contextWindowSize: 128000,
          },
        ],
      });
    });

    it('returns empty models list when none available', async () => {
      const controller = new SystemController(
        createContext(),
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'get_available_models' },
        'models-2',
      );

      expect(result).toEqual({
        subtype: 'get_available_models',
        models: [],
      });
    });
  });

  describe('get_usage_info', () => {
    it('returns dashboard with subtype when range is provided', async () => {
      const controller = new SystemController(
        createContext(),
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'get_usage_info', range: 'week' },
        'usage-1',
      );

      expect(result).toHaveProperty('subtype', 'get_usage_info');
      expect(result).toHaveProperty('generatedAt');
      expect(result).toHaveProperty('summary');
    });

    it('returns dashboard without range filter', async () => {
      const controller = new SystemController(
        createContext(),
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'get_usage_info' },
        'usage-2',
      );

      expect(result).toHaveProperty('subtype', 'get_usage_info');
      expect(result).toHaveProperty('generatedAt');
    });
  });

  describe('initialize with effort', () => {
    it('sets effort during initialize when provided', async () => {
      const context = createContext();
      (
        context.config.getReasoningEffort as ReturnType<typeof vi.fn>
      ).mockReturnValue('high');
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'initialize', effort: 'high' },
        'init-effort-1',
      );

      expect(context.config.setReasoningEffort).toHaveBeenCalledWith('high');
      expect(result).toHaveProperty('subtype', 'initialize');
      expect(result).toHaveProperty('session_id', 'test-session-id');
      expect(result).toHaveProperty('effort_status', {
        effort: 'high',
        applied: true,
        override: null,
      });
    });

    it('warns when effort not applied during initialize (thinking disabled)', async () => {
      mockDebugLogger.warn.mockClear();
      const context = createContext();
      (
        context.config.getReasoningEffort as ReturnType<typeof vi.fn>
      ).mockReturnValue('medium');
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'initialize', effort: 'high' },
        'init-effort-2',
      );

      expect(context.config.setReasoningEffort).toHaveBeenCalledWith('high');
      expect(context.config.getReasoningEffort).toHaveBeenCalled();
      expect(result).toHaveProperty('subtype', 'initialize');
      expect(result).toHaveProperty('effort_status', {
        effort: 'high',
        applied: false,
        override: null,
        reason: 'thinking may be disabled',
      });
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        "[SystemController] Effort 'high' was not applied (thinking may be disabled)",
      );
    });

    it('reports the higher-priority override during initialize', async () => {
      mockDebugLogger.warn.mockClear();
      const context = createContext();
      (
        context.config.getReasoningEffort as ReturnType<typeof vi.fn>
      ).mockReturnValue('high');
      (
        context.config.getReasoningEffortOverride as ReturnType<typeof vi.fn>
      ).mockReturnValue({
        source: 'samplingParams',
        field: 'enable_thinking',
      });
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'initialize', effort: 'high' },
        'init-effort-override',
      );

      expect(result).toHaveProperty('effort_status', {
        effort: 'high',
        applied: false,
        override: {
          source: 'samplingParams',
          field: 'enable_thinking',
        },
        reason: 'samplingParams.enable_thinking takes precedence',
      });
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        "[SystemController] Effort 'high' was not applied (samplingParams.enable_thinking takes precedence)",
      );
    });

    it('joins every held cause in the effort_status reason during initialize', async () => {
      mockDebugLogger.warn.mockClear();
      const context = createContext();
      (
        context.config.getReasoningEffort as ReturnType<typeof vi.fn>
      ).mockReturnValue('medium');
      (
        context.config.getReasoningEffortOverride as ReturnType<typeof vi.fn>
      ).mockReturnValue({
        source: 'extra_body',
        field: 'thinking_budget',
      });
      const controller = new SystemController(
        context,
        createRegistry(),
        'SystemController',
      );

      const result = await controller.handleRequest(
        { subtype: 'initialize', effort: 'high' },
        'init-effort-both-causes',
      );

      expect(result).toHaveProperty('effort_status', {
        effort: 'high',
        applied: false,
        override: {
          source: 'extra_body',
          field: 'thinking_budget',
        },
        reason:
          'thinking may be disabled; extra_body.thinking_budget takes precedence',
      });
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        "[SystemController] Effort 'high' was not applied (thinking may be disabled; extra_body.thinking_budget takes precedence)",
      );
    });

    it('rejects invalid effort during initialize', async () => {
      const controller = new SystemController(
        createContext(),
        createRegistry(),
        'SystemController',
      );

      await expect(
        controller.handleRequest(
          { subtype: 'initialize', effort: 'banana' },
          'init-effort-3',
        ),
      ).rejects.toThrow('Invalid effort value');
    });
  });
});
