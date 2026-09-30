/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthType } from '../../core/contentGenerator.js';
import type { ModelConfig, ModelProvidersConfig } from '../../models/types.js';
import {
  forgetExportedCredentials,
  isExportedCredentialEnv,
} from '../credential-store.js';
import {
  applyProviderInstallPlan,
  buildInstallPlan,
  customProvider,
  generateCustomCredentialId,
  generateCustomEnvKey,
  minimaxProvider,
  ProviderInstallError,
  type ProviderConfig,
  type ProviderInstallPlan,
  type ProviderSettingsAdapter,
} from '../index.js';

/** An in-memory credential store; `saved` exposes what it holds. */
function createCredentialStore(initial: Record<string, string> = {}) {
  const saved = new Map(Object.entries(initial));
  return {
    saved,
    read: vi.fn((id: string) =>
      saved.has(id) ? { apiKey: saved.get(id)! } : undefined,
    ),
    write: vi.fn((id: string, { apiKey }: { apiKey: string }) => {
      saved.set(id, apiKey);
    }),
    remove: vi.fn((id: string) => {
      saved.delete(id);
    }),
  };
}

function createAdapter(
  modelProviders: ModelProvidersConfig = {},
  credentials = createCredentialStore(),
) {
  let snapshot = modelProviders;
  const adapter: ProviderSettingsAdapter & {
    setValue: ReturnType<typeof vi.fn>;
    persist: ReturnType<typeof vi.fn>;
    backup: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    cleanupBackup: ReturnType<typeof vi.fn>;
    credentials: ReturnType<typeof createCredentialStore>;
  } = {
    credentials,
    getValue: vi.fn(),
    setValue: vi.fn((key: string, value: unknown) => {
      if (key.startsWith('modelProviders.'))
        modelProviders = {
          ...modelProviders,
          [key.slice('modelProviders.'.length)]:
            value as ModelProvidersConfig[string],
        };
    }),
    getModelProviders: vi.fn(() => modelProviders),
    persist: vi.fn(),
    backup: vi.fn(() => {
      snapshot = modelProviders;
    }),
    restore: vi.fn(() => {
      modelProviders = snapshot;
    }),
    cleanupBackup: vi.fn(),
  };
  return adapter;
}

describe('applyProviderInstallPlan', () => {
  it('rolls back a provider write shadowed by a higher-precedence scope before selecting it', async () => {
    const original = { openai: [{ id: 'workspace-chat' }] };
    const adapter = createAdapter(original);
    vi.mocked(adapter.getModelProviders).mockReturnValue(original);
    const plan: ProviderInstallPlan = {
      providerId: 'test',
      authType: AuthType.USE_OPENAI,
      modelSelection: { modelId: 'new-user-model' },
      modelProviders: [
        {
          authType: AuthType.USE_OPENAI,
          models: [{ id: 'new-user-model' }],
          mergeStrategy: 'append',
        },
      ],
    };
    const reload = vi.fn();
    await expect(
      applyProviderInstallPlan(plan, {
        settings: adapter,
        reloadModelProviders: reload,
      }),
    ).rejects.toMatchObject({ step: 'modelProviders' });
    expect(adapter.setValue).toHaveBeenCalledWith('modelProviders.openai', [
      { id: 'workspace-chat' },
      { id: 'new-user-model' },
    ]);
    expect(adapter.setValue).not.toHaveBeenCalledWith(
      'model.name',
      expect.anything(),
    );
    expect(adapter.setValue).not.toHaveBeenCalledWith(
      'security.auth.selectedType',
      expect.anything(),
    );
    expect(adapter.restore).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledExactlyOnceWith(original);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['TEST_API_KEY'];
    delete process.env['BRAND_NEW_KEY'];
    delete process.env['SHADOW_KEY'];
    delete process.env['EMPTY_SHADOW_KEY'];
    forgetExportedCredentials();
    // An adapter without its own store falls back to the file store.
    vi.stubEnv(
      'O1CODE_HOME',
      fs.mkdtempSync(path.join(os.tmpdir(), 'o1-install-')),
    );
  });

  afterEach(() => {
    const home = process.env['O1CODE_HOME'];
    vi.unstubAllEnvs();
    if (home) fs.rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it.each(['image', 'voice'] as const)(
    'rejects a slash-varied %s reconnect before it can overwrite conversation credentials',
    async (purpose) => {
      const baseUrl = 'https://media.example/v1';
      const chatKey = generateCustomEnvKey(AuthType.USE_OPENAI, baseUrl);
      const serviceKey = `${chatKey}_${purpose.toUpperCase()}`;
      const models = [
        { id: 'chat', baseUrl, envKey: chatKey },
        {
          id: 'service',
          baseUrl: `${baseUrl}/`,
          envKey: serviceKey,
          ...(purpose === 'image' ? { imageOnly: true } : { voiceOnly: true }),
          generationConfig: { contextWindowSize: 65536 },
        },
      ];
      const adapter = createAdapter({ openai: models });
      vi.stubEnv(chatKey, 'chat-old');
      vi.stubEnv(serviceKey, 'service-old');
      try {
        await expect(
          (async () => {
            const plan = buildInstallPlan(
              customProvider,
              {
                protocol: AuthType.USE_OPENAI,
                baseUrl,
                apiKey: 'service-new',
                modelIds: ['service'],
              },
              models,
            );
            await applyProviderInstallPlan(plan, { settings: adapter });
          })(),
        ).rejects.toMatchObject({ step: 'modelPurpose' });
        expect(adapter.setValue).not.toHaveBeenCalled();
        expect(process.env[chatKey]).toBe('chat-old');
        expect(process.env[serviceKey]).toBe('service-old');
        expect(adapter.getModelProviders()).toEqual({ openai: models });
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it.each(['image', 'voice'] as const)(
    'installs %s models without changing conversation selection',
    async (purpose) => {
      const adapter = createAdapter({ anthropic: [{ id: 'main' }] });
      const plan = buildInstallPlan(customProvider, {
        protocol: AuthType.USE_OPENAI,
        baseUrl: 'https://media.example/v1',
        apiKey: 'test-only',
        modelIds: [purpose === 'voice' ? 'qwen3-asr-flash' : 'image-01'],
        advancedConfig: { purpose, contextWindowSize: 65536 },
      });
      const envKey = plan.modelProviders![0]!.models[0]!.envKey!;
      const previous = process.env[envKey];
      const refreshAuth = vi.fn();
      const syncAuthState = vi.fn();
      try {
        expect(plan.modelSelection).toBeUndefined();
        const result = await applyProviderInstallPlan(plan, {
          settings: adapter,
          refreshAuth,
          syncAuthState,
        });
        expect(adapter.credentials.saved.get(plan.credential!.id)).toBe(
          'test-only',
        );
        // Exported for this process only, since the variable was unset.
        expect(process.env[envKey]).toBe(previous ?? 'test-only');
        expect(result.updatedModelProviders['openai']?.[0]).toMatchObject({
          ...(purpose === 'image'
            ? { imageOnly: true, supportsImageGeneration: true }
            : { voiceOnly: true }),
          generationConfig: { contextWindowSize: 65536 },
        });
        expect(result.updatedModelProviders['anthropic']).toEqual([
          { id: 'main' },
        ]);
        expect(
          adapter.setValue.mock.calls.some(
            ([key]) =>
              key === 'security.auth.selectedType' ||
              key === 'model.name' ||
              key === 'model.baseUrl',
          ),
        ).toBe(false);
        expect(refreshAuth).not.toHaveBeenCalled();
        expect(syncAuthState).not.toHaveBeenCalled();
        expect(adapter.persist).toHaveBeenCalledOnce();
      } finally {
        if (previous === undefined) delete process.env[envKey];
        else process.env[envKey] = previous;
      }
    },
  );

  it.each([false, true])(
    'installs beside null provider buckets (target null: %s)',
    async (targetNull) => {
      const providers = {
        openai: targetNull ? null : [],
        gemini: null,
      } as unknown as ModelProvidersConfig;
      const plan = buildInstallPlan(
        customProvider,
        {
          baseUrl: 'https://new.example/v1',
          apiKey: 'test',
          modelIds: ['chat'],
        },
        providers['openai'],
      );
      const envKey = plan.modelProviders![0]!.models[0]!.envKey!;
      const previous = process.env[envKey];
      try {
        const result = await applyProviderInstallPlan(plan, {
          settings: createAdapter(providers),
        });
        expect(result.updatedModelProviders['openai']).toEqual([
          expect.objectContaining({ id: 'chat' }),
        ]);
        expect(result.updatedModelProviders['gemini']).toBeNull();
      } finally {
        if (previous === undefined) delete process.env[envKey];
        else process.env[envKey] = previous;
      }
    },
  );

  it('replaces a same-identity custom image route with the preset credential', async () => {
    const baseUrl = 'https://api.minimax.io/v1';
    const adapter = createAdapter({
      openai: [
        {
          id: 'image-01',
          baseUrl,
          envKey: `${generateCustomEnvKey(AuthType.USE_OPENAI, baseUrl)}_IMAGE`,
          imageOnly: true,
          supportsImageGeneration: true,
        },
      ],
    });
    const plan = buildInstallPlan(minimaxProvider, {
      baseUrl,
      apiKey: 'test-preset-key',
      modelIds: ['image-01'],
    });
    const previous = process.env['MINIMAX_API_KEY'];
    try {
      const result = await applyProviderInstallPlan(plan, {
        settings: adapter,
      });
      expect(result.updatedModelProviders['openai']).toEqual([
        expect.objectContaining({
          id: 'image-01',
          baseUrl,
          envKey: 'MINIMAX_API_KEY',
          imageOnly: true,
        }),
      ]);
    } finally {
      if (previous === undefined) delete process.env['MINIMAX_API_KEY'];
      else process.env['MINIMAX_API_KEY'] = previous;
    }
  });

  it.each([undefined, 'voice'] as const)(
    'rejects a second endpoint for an existing voice ID before writing (%s)',
    async (purpose) => {
      const adapter = createAdapter({
        openai: [
          {
            id: 'qwen3-asr-flash',
            baseUrl: 'https://first.example/v1',
            voiceOnly: true,
            envKey: 'FIRST',
          },
        ],
      });
      const plan = buildInstallPlan(customProvider, {
        baseUrl: 'https://second.example/v1',
        apiKey: 'unused',
        modelIds: ['qwen3-asr-flash'],
        ...(purpose ? { advancedConfig: { purpose } } : {}),
      });
      await expect(
        applyProviderInstallPlan(plan, { settings: adapter }),
      ).rejects.toMatchObject({ step: 'modelPurpose' });
      expect(adapter.setValue).not.toHaveBeenCalled();
      expect(adapter.backup).not.toHaveBeenCalled();
      expect(adapter.persist).not.toHaveBeenCalled();
    },
  );

  it.each(['image', 'voice'] as const)(
    'reconnects a mixed provider without losing the %s configuration or independent key',
    async (purpose) => {
      const baseUrl = 'https://media.example/v1';
      const service = buildInstallPlan(customProvider, {
        baseUrl,
        apiKey: 'old-service',
        modelIds: ['service'],
        advancedConfig: { purpose, contextWindowSize: 65536 },
      }).modelProviders![0]!.models[0]!;
      const chatKey = generateCustomEnvKey(AuthType.USE_OPENAI, baseUrl);
      const existing = [
        { id: 'chat', baseUrl, envKey: chatKey },
        {
          ...service,
          name: 'My service',
          generationConfig: {
            ...service.generationConfig,
            customHeaders: { 'X-Test': 'preserved' },
          },
        },
      ];
      const plan = buildInstallPlan(
        customProvider,
        { baseUrl, apiKey: 'new-chat', modelIds: ['chat', 'service'] },
        existing,
      );
      const previous = process.env[chatKey];
      try {
        expect(plan.credential).toEqual({
          id: generateCustomCredentialId(AuthType.USE_OPENAI, baseUrl),
          apiKey: 'new-chat',
        });
        const result = await applyProviderInstallPlan(plan, {
          settings: createAdapter({ openai: existing }),
        });
        expect(
          result.updatedModelProviders['openai']?.find(
            (model) => model.id === 'service',
          ),
        ).toEqual(existing[1]);
        expect(plan.modelSelection?.modelId).toBe('chat');
      } finally {
        if (previous === undefined) delete process.env[chatKey];
        else process.env[chatKey] = previous;
      }
    },
  );

  it('rotates the key of a realtime-only provider without touching the conversation selection', async () => {
    const baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const envKey = `${generateCustomEnvKey(AuthType.USE_OPENAI, baseUrl)}_REALTIME`;
    const existing = [
      { id: 'omni-realtime', baseUrl, envKey, realtimeOnly: true },
    ];
    const plan = buildInstallPlan(
      customProvider,
      { baseUrl, apiKey: 'rotated', modelIds: ['omni-realtime'] },
      existing,
    );
    // The realtime route keeps a key of its own, apart from the endpoint's
    // conversation key.
    expect(plan.credential?.apiKey).toBe('rotated');
    expect(plan.credential?.id).not.toBe(
      generateCustomCredentialId(AuthType.USE_OPENAI, baseUrl),
    );
    expect(plan.modelProviders![0]!.models).toEqual([
      expect.objectContaining({
        id: 'omni-realtime',
        realtimeOnly: true,
        envKey,
        credential: plan.credential?.id,
      }),
    ]);
    expect(plan.modelSelection).toBeUndefined();

    const adapter = createAdapter({ openai: existing });
    const refreshAuth = vi.fn();
    const previous = process.env[envKey];
    try {
      await applyProviderInstallPlan(plan, { settings: adapter, refreshAuth });
      // A service-role reconnect must not re-point the chat session.
      expect(adapter.setValue).not.toHaveBeenCalledWith(
        'security.auth.selectedType',
        expect.anything(),
      );
      expect(adapter.setValue).not.toHaveBeenCalledWith(
        'model.name',
        expect.anything(),
      );
      expect(refreshAuth).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env[envKey];
      else process.env[envKey] = previous;
    }
  });

  it('refuses a realtime reconnect that would land on another route’s credential key', () => {
    const inputs = {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'new',
      modelIds: ['omni-realtime'],
    };
    const envKey = generateCustomEnvKey(AuthType.USE_OPENAI, inputs.baseUrl);
    expect(() =>
      buildInstallPlan(customProvider, inputs, [
        {
          id: 'omni-realtime',
          baseUrl: `${inputs.baseUrl}/`,
          envKey,
          realtimeOnly: true,
        },
      ]),
    ).toThrow('A service model already uses this credential endpoint');
  });

  it.each(['image', 'voice'] as const)(
    'rekeys a purpose-less %s reconnect at the original credential key',
    (purpose) => {
      const inputs = {
        baseUrl: 'https://media.example/v1',
        apiKey: 'old',
        modelIds: ['service'],
      };
      const installed = buildInstallPlan(customProvider, {
        ...inputs,
        advancedConfig: { purpose },
      });
      const originalModels = installed.modelProviders![0]!.models;
      const reconnect = buildInstallPlan(
        customProvider,
        { ...inputs, apiKey: 'new' },
        originalModels,
      );
      expect(reconnect.credential).toEqual({
        id: originalModels[0]!.credential,
        apiKey: 'new',
      });
      expect(originalModels[0]!.credential).toMatch(new RegExp(`-${purpose}$`));
      expect(reconnect.modelProviders![0]!.models).toEqual(originalModels);
      expect(reconnect.modelSelection).toBeUndefined();
    },
  );

  it('rejects a single credential update for independently keyed image and voice models', () => {
    const inputs = {
      baseUrl: 'https://media.example/v1',
      apiKey: 'unused',
      modelIds: [] as string[],
    };
    const existing = (['image', 'voice'] as const).flatMap(
      (purpose) =>
        buildInstallPlan(customProvider, {
          ...inputs,
          modelIds: [purpose],
          advancedConfig: { purpose },
        }).modelProviders![0]!.models,
    );
    expect(() =>
      buildInstallPlan(
        customProvider,
        { ...inputs, modelIds: ['image', 'voice'] },
        existing,
      ),
    ).toThrow('separately');
  });

  it.each([
    ['chat', 'image'],
    ['chat', 'voice'],
    ['image', 'chat'],
    ['voice', 'chat'],
    ['image', 'voice'],
    ['voice', 'image'],
  ] as const)(
    'rejects changing the same model identity from %s to %s before any write',
    async (from, to) => {
      const existing: ModelProvidersConfig = {
        openai: [
          {
            id: 'main',
            baseUrl: 'https://media.example/v1',
            ...(from === 'image' ? { imageOnly: true } : {}),
            ...(from === 'voice' ? { voiceOnly: true } : {}),
          },
        ],
      };
      const snapshot = structuredClone(existing);
      const adapter = createAdapter(existing);
      process.env['TEST_API_KEY'] = 'unchanged';
      const plan = buildInstallPlan(customProvider, {
        protocol: AuthType.USE_OPENAI,
        baseUrl: 'https://media.example/v1',
        apiKey: 'test-only',
        modelIds: ['main'],
        ...(to === 'chat' ? {} : { advancedConfig: { purpose: to } }),
      });
      plan.credential = { id: 'test', apiKey: 'must-not-write' };
      const reloadModelProviders = vi.fn();
      await expect(
        applyProviderInstallPlan(plan, {
          settings: adapter,
          reloadModelProviders,
        }),
      ).rejects.toMatchObject({
        name: 'ProviderInstallError',
        step: 'modelPurpose',
        authType: AuthType.USE_OPENAI,
      });
      expect(adapter.setValue).not.toHaveBeenCalled();
      expect(adapter.backup).not.toHaveBeenCalled();
      expect(adapter.persist).not.toHaveBeenCalled();
      expect(reloadModelProviders).not.toHaveBeenCalled();
      expect(process.env['TEST_API_KEY']).toBe('unchanged');
      expect(adapter.credentials.write).not.toHaveBeenCalled();
      expect(existing).toEqual(snapshot);
    },
  );

  it('rejects a service preset that would remove an owned conversation model', async () => {
    const conversation = {
      id: 'MiniMax-M2.7',
      name: '[MiniMax] MiniMax-M2.7',
      baseUrl: 'https://api.minimax.io/v1',
      envKey: 'MINIMAX_API_KEY',
    };
    const adapter = createAdapter({ openai: [conversation] });
    const plan = buildInstallPlan(minimaxProvider, {
      baseUrl: conversation.baseUrl,
      apiKey: 'must-not-write',
      modelIds: ['image-01'],
    });
    const previous = process.env['MINIMAX_API_KEY'];
    process.env['MINIMAX_API_KEY'] = 'chat-secret';
    try {
      expect(plan.modelSelection).toBeUndefined();
      expect(plan.modelProviders?.[0]?.ownsModel?.(conversation)).toBe(true);
      await expect(
        applyProviderInstallPlan(plan, { settings: adapter }),
      ).rejects.toMatchObject({ step: 'modelPurpose' });
      expect(adapter.setValue).not.toHaveBeenCalled();
      expect(adapter.backup).not.toHaveBeenCalled();
      expect(adapter.persist).not.toHaveBeenCalled();
      expect(adapter.getModelProviders()).toEqual({ openai: [conversation] });
      expect(process.env['MINIMAX_API_KEY']).toBe('chat-secret');
      expect(adapter.credentials.write).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env['MINIMAX_API_KEY'];
      else process.env['MINIMAX_API_KEY'] = previous;
    }
  });

  it.each(['image', 'voice', 'mixed'] as const)(
    'rejects a conversation preset that would remove an owned service model (%s)',
    async (purpose) => {
      const service = {
        id: purpose === 'voice' ? 'qwen3-asr-flash' : 'image-01',
        name: '[MiniMax] service',
        baseUrl: 'https://api.minimax.io/v1',
        envKey: 'MINIMAX_API_KEY',
        ...(purpose === 'voice'
          ? { voiceOnly: true }
          : { imageOnly: true, supportsImageGeneration: true }),
      };
      const adapter = createAdapter({ openai: [service] });
      const plan = buildInstallPlan(minimaxProvider, {
        baseUrl: service.baseUrl,
        apiKey: 'must-not-write',
        modelIds:
          purpose === 'mixed'
            ? ['MiniMax-M2.7', 'image-01-live']
            : ['MiniMax-M2.7'],
      });
      const previous = process.env['MINIMAX_API_KEY'];
      process.env['MINIMAX_API_KEY'] = 'service-secret';
      const reloadModelProviders = vi.fn();
      try {
        expect(plan.modelProviders?.[0]?.ownsModel?.(service)).toBe(true);
        await expect(
          applyProviderInstallPlan(plan, {
            settings: adapter,
            reloadModelProviders,
          }),
        ).rejects.toMatchObject({ step: 'modelPurpose' });
        expect(adapter.setValue).not.toHaveBeenCalled();
        expect(adapter.backup).not.toHaveBeenCalled();
        expect(adapter.persist).not.toHaveBeenCalled();
        expect(reloadModelProviders).not.toHaveBeenCalled();
        expect(adapter.getModelProviders()).toEqual({ openai: [service] });
        expect(process.env['MINIMAX_API_KEY']).toBe('service-secret');
      } finally {
        if (previous === undefined) delete process.env['MINIMAX_API_KEY'];
        else process.env['MINIMAX_API_KEY'] = previous;
      }
    },
  );

  it.each(['conversation', 'service'] as const)(
    'does not reject a %s preset over an owned model in a sibling route bucket it never rewrites',
    async (installs) => {
      const conversation = {
        id: 'MiniMax-M2.7',
        name: '[MiniMax] MiniMax-M2.7',
        baseUrl: 'https://api.minimax.io/v1',
        envKey: 'MINIMAX_API_KEY',
      };
      const service = {
        id: 'image-01',
        name: '[MiniMax] service',
        baseUrl: 'https://api.minimax.io/v1',
        envKey: 'MINIMAX_API_KEY',
        imageOnly: true,
        supportsImageGeneration: true,
      };
      // The owned model of the *other* purpose lives in a user-named bucket
      // that merely resolves to the same protocol. The install rewrites only
      // `modelProviders.openai`, so nothing here can drop it and the removal
      // guards must not fire.
      const sibling = installs === 'conversation' ? service : conversation;
      const adapter = createAdapter({ myrouter: [sibling], openai: [] });
      vi.mocked(adapter.getValue).mockImplementation((key) =>
        key === 'providerProtocol' ? { myrouter: 'openai' } : undefined,
      );
      const plan = buildInstallPlan(minimaxProvider, {
        baseUrl: sibling.baseUrl,
        apiKey: 'test-only',
        modelIds: installs === 'conversation' ? ['MiniMax-M2.7'] : ['image-01'],
      });
      delete plan.credential;
      expect(plan.modelProviders?.[0]?.ownsModel?.(sibling)).toBe(true);
      const result = await applyProviderInstallPlan(plan, {
        settings: adapter,
      });
      expect(adapter.getModelProviders()).toEqual({
        myrouter: [sibling],
        openai: plan.modelProviders![0]!.models,
      });
      expect(result.updatedModelProviders).toEqual(adapter.getModelProviders());
      expect(adapter.setValue).not.toHaveBeenCalledWith(
        'modelProviders.myrouter',
        expect.anything(),
      );
      expect(adapter.persist).toHaveBeenCalledOnce();
    },
  );

  it('still rejects a purpose change for the same identity in a sibling Responses bucket', async () => {
    // Unlike the removal guards, the purpose-change guard must keep its
    // route-aware view: the legacy-bucket cleanup deletes an identity match
    // from any bucket resolving to the Responses route, so replacing an
    // image model there with a conversation model is a real removal.
    const baseUrl = 'https://media.example/v1';
    const existing: ModelProvidersConfig = {
      myrouter: [{ id: 'main', baseUrl, imageOnly: true }],
      openai: [],
    };
    const snapshot = structuredClone(existing);
    const adapter = createAdapter(existing);
    vi.mocked(adapter.getValue).mockImplementation((key) =>
      key === 'providerProtocol' ? { myrouter: 'openai-responses' } : undefined,
    );
    const plan = buildInstallPlan(customProvider, {
      protocol: AuthType.USE_OPENAI,
      wireApi: 'responses',
      baseUrl,
      apiKey: 'test-only',
      modelIds: ['main'],
    });
    await expect(
      applyProviderInstallPlan(plan, { settings: adapter }),
    ).rejects.toMatchObject({
      step: 'modelPurpose',
      message: expect.stringContaining('another purpose'),
    });
    expect(adapter.setValue).not.toHaveBeenCalled();
    expect(adapter.backup).not.toHaveBeenCalled();
    expect(adapter.persist).not.toHaveBeenCalled();
    expect(adapter.credentials.write).not.toHaveBeenCalled();
    expect(existing).toEqual(snapshot);
  });

  it.each(['append-chat', 'reselect-service', 'reselect-chat'] as const)(
    'preserves intentional preset merge behavior (%s)',
    async (scenario) => {
      const existing = {
        id: scenario === 'reselect-chat' ? 'MiniMax-M2.7' : 'image-01',
        name: '[MiniMax] existing',
        baseUrl: 'https://api.minimax.io/v1',
        envKey: 'MINIMAX_API_KEY',
        ...(scenario === 'reselect-chat'
          ? {}
          : { imageOnly: true, supportsImageGeneration: true }),
      };
      const plan = buildInstallPlan(minimaxProvider, {
        baseUrl: existing.baseUrl,
        apiKey: 'test-only',
        modelIds: [
          scenario === 'reselect-service'
            ? 'image-01-live'
            : 'MiniMax-M2.7-highspeed',
        ],
      });
      if (scenario === 'append-chat')
        plan.modelProviders![0]!.mergeStrategy = 'append';
      delete plan.credential;
      const result = await applyProviderInstallPlan(plan, {
        settings: createAdapter({ openai: [existing] }),
      });
      expect(result.updatedModelProviders['openai']).toEqual([
        ...(scenario === 'append-chat' ? [existing] : []),
        ...plan.modelProviders![0]!.models,
      ]);
    },
  );

  it.each(['https://api.minimax.io/v1', 'https://api.minimaxi.com/v1'])(
    'reinstalls owned conversation and image models at %s',
    async (baseUrl) => {
      const inputs = {
        baseUrl: 'https://api.minimax.io/v1',
        apiKey: 'test-only',
        modelIds: ['MiniMax-M2.7', 'image-01'],
      };
      const existing = buildInstallPlan(minimaxProvider, inputs)
        .modelProviders![0]!.models;
      const foreign = { id: 'foreign', envKey: 'OTHER_KEY' };
      const adapter = createAdapter({ openai: [...existing, foreign] });
      const plan = buildInstallPlan(minimaxProvider, { ...inputs, baseUrl });
      delete plan.credential;
      const reloadModelProviders = vi.fn();
      const result = await applyProviderInstallPlan(plan, {
        settings: adapter,
        reloadModelProviders,
      });
      const models = result.updatedModelProviders['openai']!;
      // Another provider's conversation model is not kept after /auth.
      expect(models).toHaveLength(2);
      expect(models).not.toContainEqual(foreign);
      expect(models).toContainEqual(
        expect.objectContaining({ id: 'MiniMax-M2.7', baseUrl }),
      );
      expect(models).toContainEqual(
        expect.objectContaining({
          id: 'image-01',
          baseUrl,
          imageOnly: true,
          envKey: 'MINIMAX_API_KEY',
        }),
      );
      expect(adapter.persist).toHaveBeenCalledOnce();
      expect(reloadModelProviders).toHaveBeenCalledExactlyOnceWith(
        result.updatedModelProviders,
      );
    },
  );

  it.each(['chat', 'voice'] as const)(
    'rejects migrating an owned image model to %s at a different endpoint before writing',
    async (purpose) => {
      const service = {
        id: 'image-01',
        name: '[MiniMax] image-01',
        baseUrl: 'https://api.minimax.io/v1',
        envKey: 'MINIMAX_API_KEY',
        imageOnly: true,
        supportsImageGeneration: true,
      };
      const adapter = createAdapter({ openai: [service] });
      const plan = buildInstallPlan(minimaxProvider, {
        baseUrl: 'https://api.minimaxi.com/v1',
        apiKey: 'test-only',
        modelIds: ['MiniMax-M2.7', service.id],
      });
      const replacement = plan.modelProviders![0]!.models[1]!;
      replacement.imageOnly = false;
      replacement.voiceOnly = purpose === 'voice';
      replacement.supportsImageGeneration = false;
      await expect(
        applyProviderInstallPlan(plan, { settings: adapter }),
      ).rejects.toMatchObject({ step: 'modelPurpose' });
      expect(adapter.getModelProviders()).toEqual({ openai: [service] });
      expect(adapter.setValue).not.toHaveBeenCalled();
      expect(adapter.backup).not.toHaveBeenCalled();
      expect(adapter.persist).not.toHaveBeenCalled();
      expect(adapter.credentials.write).not.toHaveBeenCalled();
    },
  );

  it.each(['image', 'voice'] as const)(
    'isolates %s credentials from a conversation model at the same endpoint',
    async (purpose) => {
      const inputs = {
        protocol: AuthType.USE_OPENAI,
        baseUrl: 'https://media.example/v1',
      };
      const chat = buildInstallPlan(customProvider, {
        ...inputs,
        apiKey: 'chat-secret',
        modelIds: ['chat-model'],
      });
      const service = buildInstallPlan(customProvider, {
        ...inputs,
        apiKey: 'service-secret',
        modelIds: ['service-model'],
        advancedConfig: { purpose },
      });
      const chatId = chat.credential!.id;
      const serviceId = service.credential!.id;
      expect(serviceId).not.toBe(chatId);
      const store = createCredentialStore();
      const installed = await applyProviderInstallPlan(chat, {
        settings: createAdapter({}, store),
      });
      const adapter = createAdapter(installed.updatedModelProviders, store);
      const result = await applyProviderInstallPlan(service, {
        settings: adapter,
      });
      expect(result.updatedModelProviders['openai']).toEqual([
        ...installed.updatedModelProviders['openai']!,
        expect.objectContaining({
          id: 'service-model',
          credential: serviceId,
        }),
      ]);
      expect(result.updatedModelProviders['openai']?.[0]?.credential).toBe(
        chatId,
      );
      expect(store.saved.get(chatId)).toBe('chat-secret');
      expect(store.saved.get(serviceId)).toBe('service-secret');
      expect(
        adapter.setValue.mock.calls.some(([key]) =>
          String(key).startsWith('env.'),
        ),
      ).toBe(false);
    },
  );

  it('updates a service model while preserving the same conversation ID at another endpoint', async () => {
    const conversation = { id: 'model', baseUrl: 'https://chat.example/v1' };
    const adapter = createAdapter({
      openai: [
        conversation,
        { id: 'model', baseUrl: 'https://media.example/v1', imageOnly: true },
      ],
    });
    const plan = buildInstallPlan(customProvider, {
      protocol: AuthType.USE_OPENAI,
      baseUrl: 'https://media.example/v1',
      apiKey: 'test-only',
      modelIds: ['model'],
      advancedConfig: { purpose: 'image', contextWindowSize: 65536 },
    });
    delete plan.credential;
    const result = await applyProviderInstallPlan(plan, { settings: adapter });
    expect(result.updatedModelProviders['openai']).toHaveLength(2);
    expect(result.updatedModelProviders['openai']?.[0]).toEqual(conversation);
    expect(result.updatedModelProviders['openai']).toContainEqual(
      expect.objectContaining({
        id: 'model',
        baseUrl: 'https://media.example/v1',
        imageOnly: true,
        generationConfig: { contextWindowSize: 65536 },
      }),
    );
  });

  it('refuses a credential id that would leave the credentials directory', async () => {
    const adapter = createAdapter();
    delete (adapter as Partial<typeof adapter>).credentials;
    const plan: ProviderInstallPlan = {
      providerId: 'evil',
      authType: AuthType.USE_OPENAI,
      credential: { id: '../settings', apiKey: 'sk' },
    };

    await expect(
      applyProviderInstallPlan(plan, { settings: adapter }),
    ).rejects.toThrow(/credential id/i);
    expect(adapter.persist).not.toHaveBeenCalled();
  });

  it('saves the key in the file store when the adapter brings none', async () => {
    const adapter = createAdapter();
    delete (adapter as Partial<typeof adapter>).credentials;
    const plan: ProviderInstallPlan = {
      providerId: 'test-provider',
      authType: AuthType.USE_OPENAI,
      credential: { id: 'test-provider', apiKey: 'sk-file' },
    };

    await applyProviderInstallPlan(plan, { settings: adapter });

    const file = path.join(
      process.env['O1CODE_HOME']!,
      'credentials',
      'test-provider.json',
    );
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({
      apiKey: 'sk-file',
    });
  });

  it('persists the credential, auth selection, selected model, and the installed provider only', async () => {
    const adapter = createAdapter({
      [AuthType.USE_OPENAI]: [
        {
          id: 'old-owned',
          envKey: 'TEST_API_KEY',
          generationConfig: { contextWindowSize: 123 },
        },
        {
          id: 'preserved',
          envKey: 'OTHER_API_KEY',
          generationConfig: { contextWindowSize: 456 },
        },
      ],
    });
    const reloadModelProviders = vi.fn();
    const syncAuthState = vi.fn();
    const refreshAuth = vi.fn(async () => undefined);

    const plan: ProviderInstallPlan = {
      providerId: 'test-provider',
      authType: AuthType.USE_OPENAI,
      credential: { id: 'test-provider', apiKey: 'sk-test' },
      modelSelection: { modelId: 'new-model' },
      modelProviders: [
        {
          authType: AuthType.USE_OPENAI,
          models: [
            {
              id: 'new-model',
              envKey: 'TEST_API_KEY',
              credential: 'test-provider',
            },
          ],
          mergeStrategy: 'prepend-and-remove-owned',
          ownsModel: (model) => model.envKey === 'TEST_API_KEY',
        },
      ],
    };

    await applyProviderInstallPlan(plan, {
      settings: adapter,
      reloadModelProviders,
      syncAuthState,
      refreshAuth,
    });

    expect(adapter.credentials.saved.get('test-provider')).toBe('sk-test');
    // The key is saved only in the credential store; settings never receive
    // it. This process gets it in the entry's unset variable so `${VAR}`
    // placeholders resolve.
    expect(
      adapter.setValue.mock.calls.some(
        ([key]) =>
          String(key).startsWith('env.') ||
          String(key).startsWith('security.auth.apiKey'),
      ),
    ).toBe(false);
    expect(process.env['TEST_API_KEY']).toBe('sk-test');
    expect(isExportedCredentialEnv('TEST_API_KEY')).toBe(true);
    // Only the installed provider's conversation models remain.
    expect(adapter.getModelProviders()[AuthType.USE_OPENAI]).toEqual([
      { id: 'new-model', envKey: 'TEST_API_KEY', credential: 'test-provider' },
    ]);
    expect(adapter.setValue).toHaveBeenCalledWith(
      'security.auth.selectedType',
      AuthType.USE_OPENAI,
    );
    expect(adapter.setValue).toHaveBeenCalledWith('model.name', 'new-model');
    // Id-only model selection must clear any stale baseUrl disambiguator
    // (empty-string tombstone overrides a lower-scope value on merge).
    expect(adapter.setValue).toHaveBeenCalledWith('model.baseUrl', '');
    expect(adapter.persist).toHaveBeenCalled();
    expect(reloadModelProviders).toHaveBeenCalledWith({
      [AuthType.USE_OPENAI]: [
        {
          id: 'new-model',
          envKey: 'TEST_API_KEY',
          credential: 'test-provider',
        },
      ],
    });
    expect(syncAuthState).toHaveBeenCalledWith(
      AuthType.USE_OPENAI,
      'new-model',
      undefined,
    );
    expect(refreshAuth).toHaveBeenCalledWith(AuthType.USE_OPENAI);
    expect(adapter.cleanupBackup).toHaveBeenCalled();
  });

  it('can skip immediate auth refresh', async () => {
    const adapter = createAdapter();
    const refreshAuth = vi.fn(async () => undefined);
    const plan: ProviderInstallPlan = {
      providerId: 'test-provider',
      authType: AuthType.USE_OPENAI,
      credential: { id: 'test-provider', apiKey: 'sk-test' },
    };

    await applyProviderInstallPlan(plan, {
      settings: adapter,
      refreshAuth,
      doRefreshAuth: false,
    });

    expect(adapter.credentials.saved.get('test-provider')).toBe('sk-test');
    expect(refreshAuth).not.toHaveBeenCalled();
  });

  /** A plan whose models read `envKey` before the saved credential. */
  const planWithEnvKeys = (
    apiKey: string,
    ...envKeys: string[]
  ): ProviderInstallPlan => ({
    providerId: 'test-provider',
    authType: AuthType.USE_OPENAI,
    credential: { id: 'test-provider', apiKey },
    modelProviders: [
      {
        authType: AuthType.USE_OPENAI,
        models: envKeys.map((envKey, index) => ({
          id: `model-${index}`,
          envKey,
          credential: 'test-provider',
        })),
        mergeStrategy: 'append',
      },
    ],
  });

  it('replaces its own exported value when a key is rotated, and never the user one', async () => {
    await applyProviderInstallPlan(planWithEnvKeys('first', 'SHADOW_KEY'), {
      settings: createAdapter(),
    });
    await applyProviderInstallPlan(planWithEnvKeys('second', 'SHADOW_KEY'), {
      settings: createAdapter(),
    });
    expect(process.env['SHADOW_KEY']).toBe('second');

    process.env['EMPTY_SHADOW_KEY'] = 'from-shell';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await applyProviderInstallPlan(
      planWithEnvKeys('third', 'EMPTY_SHADOW_KEY'),
      { settings: createAdapter() },
    );
    expect(process.env['EMPTY_SHADOW_KEY']).toBe('from-shell');
  });

  it('withdraws the exported value when the install fails', async () => {
    const adapter = createAdapter();
    await expect(
      applyProviderInstallPlan(planWithEnvKeys('new', 'SHADOW_KEY'), {
        settings: adapter,
        refreshAuth: vi.fn(async () => {
          throw new Error('refused');
        }),
      }),
    ).rejects.toThrow('refused');
    expect(process.env['SHADOW_KEY']).toBeUndefined();
  });

  it('warns when a key set in the environment will win over the saved one', async () => {
    process.env['SHADOW_KEY'] = 'old-value';
    const adapter = createAdapter();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await applyProviderInstallPlan(planWithEnvKeys('new-value', 'SHADOW_KEY'), {
      settings: adapter,
    });

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('SHADOW_KEY is also set'),
    );
    expect(process.env['SHADOW_KEY']).toBe('old-value');
    expect(adapter.credentials.saved.get('test-provider')).toBe('new-value');
  });

  it('does not warn for a same or empty environment value', async () => {
    process.env['SHADOW_KEY'] = 'same-value';
    process.env['EMPTY_SHADOW_KEY'] = '';
    const adapter = createAdapter();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await applyProviderInstallPlan(
      planWithEnvKeys('same-value', 'SHADOW_KEY', 'EMPTY_SHADOW_KEY'),
      { settings: adapter },
    );

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('uses patch ownsModel for merge filtering', async () => {
    const adapter = createAdapter({
      [AuthType.USE_OPENAI]: [
        { id: 'old-a', envKey: 'A' },
        { id: 'old-b', envKey: 'B' },
      ],
    });
    const plan: ProviderInstallPlan = {
      providerId: 'test-provider',
      authType: AuthType.USE_OPENAI,
      modelProviders: [
        {
          authType: AuthType.USE_OPENAI,
          models: [{ id: 'new-a', envKey: 'A' }],
          mergeStrategy: 'prepend-and-remove-owned',
          ownsModel: (model) => model.envKey === 'A',
        },
      ],
    };

    await applyProviderInstallPlan(plan, { settings: adapter });

    expect(adapter.setValue).toHaveBeenCalledWith('modelProviders.openai', [
      { id: 'new-a', envKey: 'A' },
      { id: 'old-b', envKey: 'B' },
    ]);
  });

  it('falls back to id+baseUrl identity when ownsModel is omitted', async () => {
    const adapter = createAdapter({
      [AuthType.USE_OPENAI]: [
        // Same id, different baseUrl → should be preserved (different identity)
        { id: 'gpt-4o', baseUrl: 'https://proxy-a.example/v1' },
        // Same id+baseUrl as incoming → should be removed
        { id: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
        // Different id, same baseUrl as incoming → should be preserved
        { id: 'gpt-3.5', baseUrl: 'https://api.openai.com/v1' },
      ],
    });
    const plan: ProviderInstallPlan = {
      providerId: 'test-provider',
      authType: AuthType.USE_OPENAI,
      modelProviders: [
        {
          authType: AuthType.USE_OPENAI,
          models: [{ id: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' }],
          mergeStrategy: 'prepend-and-remove-owned',
          // ownsModel intentionally omitted — exercises isSameModelIdentity path
        },
      ],
    };

    await applyProviderInstallPlan(plan, { settings: adapter });

    expect(adapter.setValue).toHaveBeenCalledWith('modelProviders.openai', [
      { id: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
      { id: 'gpt-4o', baseUrl: 'https://proxy-a.example/v1' },
      { id: 'gpt-3.5', baseUrl: 'https://api.openai.com/v1' },
    ]);
  });

  it.each([false, true])(
    'preserves the other API sibling when installing Responses (ownsModel=%s)',
    async (owned) => {
      const baseUrl = 'https://gateway.test/v1';
      const chat = { id: 'same', baseUrl, envKey: 'TEST_API_KEY' };
      const responses = {
        id: 'same',
        baseUrl,
        wireApi: 'responses' as const,
        envKey: 'TEST_API_KEY',
      };
      const adapter = createAdapter({
        openai: [chat, { ...responses, name: 'old' }],
      });
      vi.mocked(adapter.getValue).mockImplementation(
        (key) =>
          (
            ({
              'security.auth.selectedType': AuthType.USE_OPENAI,
              'model.name': 'same',
              'model.baseUrl': baseUrl,
            }) as Record<string, unknown>
          )[key],
      );
      const syncAuthState = vi.fn();
      await applyProviderInstallPlan(
        {
          providerId: 'test',
          authType: AuthType.USE_OPENAI_RESPONSES,
          modelSelection: { modelId: 'same', baseUrl },
          modelProviders: [
            {
              authType: AuthType.USE_OPENAI,
              models: [responses],
              mergeStrategy: 'prepend-and-remove-owned',
              ...(owned ? { ownsModel: () => true } : {}),
            },
          ],
        },
        { settings: adapter, syncAuthState },
      );
      expect(adapter.setValue).toHaveBeenCalledWith('modelProviders.openai', [
        responses,
        chat,
      ]);
      expect(syncAuthState).toHaveBeenCalledWith(
        AuthType.USE_OPENAI_RESPONSES,
        'same',
        baseUrl,
      );
    },
  );

  it('preserves a non-first canonical Responses selection across reinstall', async () => {
    const baseUrl = 'https://gateway.test/v1';
    const models = ['first', 'chosen'].map((id) => ({
      id,
      baseUrl,
      wireApi: 'responses' as const,
    }));
    const adapter = createAdapter({ openai: models });
    vi.mocked(adapter.getValue).mockImplementation(
      (key) =>
        (
          ({
            'security.auth.selectedType': AuthType.USE_OPENAI,
            'model.name': 'chosen',
            'model.baseUrl': baseUrl,
          }) as Record<string, unknown>
        )[key],
    );
    const syncAuthState = vi.fn();
    await applyProviderInstallPlan(
      {
        providerId: 'test',
        authType: AuthType.USE_OPENAI_RESPONSES,
        modelSelection: { modelId: 'first', baseUrl },
        modelProviders: [
          {
            authType: AuthType.USE_OPENAI,
            models,
            mergeStrategy: 'prepend-and-remove-owned',
          },
        ],
      },
      { settings: adapter, syncAuthState },
    );
    // The reinstall still persists the merged providers map — preserving the
    // selection must not silently skip the install itself.
    expect(adapter.setValue).toHaveBeenCalledWith(
      'modelProviders.openai',
      models,
    );
    expect(adapter.setValue).not.toHaveBeenCalledWith(
      'model.name',
      expect.anything(),
    );
    expect(syncAuthState).not.toHaveBeenCalled();
  });

  it('keeps a non-first current model when reinstalling across an API route change', async () => {
    const baseUrl = 'https://gateway.test/v1';
    const chatModels = ['glm-4.6', 'qwen3-max', 'deepseek-v3'].map((id) => ({
      id,
      baseUrl,
      envKey: 'TEST_API_KEY',
    }));
    const responsesModels = chatModels.map((model) => ({
      ...model,
      wireApi: 'responses' as const,
    }));
    const adapter = createAdapter({ openai: chatModels });
    vi.mocked(adapter.getValue).mockImplementation(
      (key) =>
        (
          ({
            'security.auth.selectedType': AuthType.USE_OPENAI,
            'model.name': 'qwen3-max',
            'model.baseUrl': baseUrl,
          }) as Record<string, unknown>
        )[key],
    );
    const syncAuthState = vi.fn();
    await applyProviderInstallPlan(
      {
        providerId: 'test',
        authType: AuthType.USE_OPENAI_RESPONSES,
        modelSelection: { modelId: 'glm-4.6', baseUrl },
        modelProviders: [
          {
            authType: AuthType.USE_OPENAI,
            models: responsesModels,
            mergeStrategy: 'prepend-and-remove-owned',
          },
        ],
      },
      { settings: adapter, syncAuthState },
    );
    // The plan still offers the user's chosen model on the new route: keep it
    // instead of adopting the plan's first model, but still re-sync the live
    // session onto the new wire.
    expect(adapter.setValue).not.toHaveBeenCalledWith(
      'model.name',
      expect.anything(),
    );
    expect(syncAuthState).toHaveBeenCalledWith(
      AuthType.USE_OPENAI_RESPONSES,
      'qwen3-max',
      baseUrl,
    );
  });

  it('does not throw when an owned stored entry has an invalid wireApi', async () => {
    const invalid = {
      id: 'old',
      envKey: 'TEST_API_KEY',
      wireApi: 'invalid' as ModelConfig['wireApi'],
    };
    const adapter = createAdapter({ openai: [invalid] });
    const result = await applyProviderInstallPlan(
      {
        providerId: 'test',
        authType: AuthType.USE_OPENAI,
        modelProviders: [
          {
            authType: AuthType.USE_OPENAI,
            models: [{ id: 'new', envKey: 'TEST_API_KEY' }],
            mergeStrategy: 'prepend-and-remove-owned',
            ownsModel: (model) => model.envKey === 'TEST_API_KEY',
          },
        ],
      },
      { settings: adapter },
    );
    // No throw; the earlier conversation entry is not kept after the install.
    expect(result.updatedModelProviders['openai']).toEqual([
      { id: 'new', envKey: 'TEST_API_KEY' },
    ]);
  });

  it('does not let an invalid api elsewhere in settings abort a non-OpenAI install', async () => {
    const adapter = createAdapter({
      openai: [
        { id: 'm', envKey: 'A', wireApi: 'response' as ModelConfig['wireApi'] },
      ],
    });
    vi.mocked(adapter.getValue).mockImplementation(
      (key) =>
        (
          ({
            'security.auth.selectedType': AuthType.USE_OPENAI,
            'model.name': 'm',
          }) as Record<string, unknown>
        )[key],
    );
    // The pre-install wire resolution scans every modelProviders entry, so an
    // invalid `wireApi` in an unrelated bucket would throw ahead of the plan's own
    // error contract. A non-OpenAI plan never consults it.
    const plan: ProviderInstallPlan = {
      providerId: 'anthropic',
      authType: AuthType.USE_ANTHROPIC,
      modelSelection: { modelId: 'm' },
      modelProviders: [
        {
          authType: AuthType.USE_ANTHROPIC,
          models: [{ id: 'm', envKey: 'ANTHROPIC_API_KEY' }],
          mergeStrategy: 'prepend-and-remove-owned',
        },
      ],
    };
    await expect(
      applyProviderInstallPlan(plan, { settings: adapter }),
    ).resolves.toMatchObject({
      updatedModelProviders: {
        anthropic: [{ id: 'm', envKey: 'ANTHROPIC_API_KEY' }],
      },
    });
  });

  it('does not let an invalid api elsewhere in settings abort an OpenAI-family install', async () => {
    // The pre-install wire probe walks every bucket of the previous providers
    // map with the throwing resolver; an invalid `wireApi` in a bucket the plan
    // never touches must skip the probe, not refuse the install.
    const adapter = createAdapter({
      acme: [
        { id: 'q1', envKey: 'A', wireApi: 'resp' as ModelConfig['wireApi'] },
      ],
    });
    vi.mocked(adapter.getValue).mockImplementation(
      (key) =>
        (
          ({
            'security.auth.selectedType': AuthType.USE_OPENAI,
            'model.name': 'q1',
            providerProtocol: { acme: 'openai' },
          }) as Record<string, unknown>
        )[key],
    );
    const plan: ProviderInstallPlan = {
      providerId: 'openai',
      authType: AuthType.USE_OPENAI_RESPONSES,
      modelSelection: { modelId: 'q1' },
      modelProviders: [
        {
          authType: AuthType.USE_OPENAI,
          models: [
            {
              id: 'q1',
              envKey: 'TEST_API_KEY',
              wireApi: 'responses' as const,
            },
          ],
          mergeStrategy: 'prepend-and-remove-owned',
        },
      ],
    };
    await expect(
      applyProviderInstallPlan(plan, { settings: adapter }),
    ).resolves.toMatchObject({
      updatedModelProviders: {
        openai: [{ id: 'q1', envKey: 'TEST_API_KEY', wireApi: 'responses' }],
      },
    });
  });

  it('does not let an invalid api elsewhere in settings abort a voice install', async () => {
    // The voice-conflict probe rebuilds a registry over every bucket of the
    // prospective providers map, and the registry constructor validates each
    // entry. An invalid `wireApi` in a bucket the plan never touches must not
    // refuse the install — least of all with a bare Error the daemon answers
    // as a 500 instead of the 400 `model_purpose_conflict`.
    const baseUrl = 'https://voice.example/v1';
    const adapter = createAdapter({
      acme: [
        { id: 'q1', envKey: 'A', wireApi: 'resp' as ModelConfig['wireApi'] },
      ],
      openai: [
        {
          id: 'qwen3-asr-flash',
          baseUrl,
          voiceOnly: true,
          envKey: `${generateCustomEnvKey(AuthType.USE_OPENAI, baseUrl)}_VOICE`,
        },
      ],
    });
    vi.mocked(adapter.getValue).mockImplementation(
      (key) =>
        (
          ({
            'security.auth.selectedType': AuthType.USE_OPENAI,
            providerProtocol: { acme: 'openai' },
          }) as Record<string, unknown>
        )[key],
    );
    const plan = buildInstallPlan(customProvider, {
      baseUrl,
      apiKey: 'unused',
      modelIds: ['qwen3-asr-flash'],
      advancedConfig: { purpose: 'voice' },
    });
    await expect(
      applyProviderInstallPlan(plan, { settings: adapter }),
    ).resolves.toMatchObject({
      updatedModelProviders: {
        openai: [{ id: 'qwen3-asr-flash', baseUrl, voiceOnly: true }],
      },
    });
  });

  it('keeps the duplicate-voice refusal on its step next to an invalid api elsewhere', async () => {
    // Same map, but the plan reconnects the voice id at another endpoint: the
    // refusal must still be the `modelPurpose` ProviderInstallError the daemon
    // maps to `model_purpose_conflict`, not the registry's validation Error.
    const adapter = createAdapter({
      acme: [
        { id: 'q1', envKey: 'A', wireApi: 'resp' as ModelConfig['wireApi'] },
      ],
      openai: [
        {
          id: 'qwen3-asr-flash',
          baseUrl: 'https://first.example/v1',
          voiceOnly: true,
          envKey: 'FIRST',
        },
      ],
    });
    vi.mocked(adapter.getValue).mockImplementation(
      (key) =>
        (
          ({
            'security.auth.selectedType': AuthType.USE_OPENAI,
            providerProtocol: { acme: 'openai' },
          }) as Record<string, unknown>
        )[key],
    );
    const plan = buildInstallPlan(customProvider, {
      baseUrl: 'https://second.example/v1',
      apiKey: 'unused',
      modelIds: ['qwen3-asr-flash'],
      advancedConfig: { purpose: 'voice' },
    });
    await expect(
      applyProviderInstallPlan(plan, { settings: adapter }),
    ).rejects.toMatchObject({
      name: 'ProviderInstallError',
      step: 'modelPurpose',
    });
    expect(adapter.setValue).not.toHaveBeenCalled();
  });

  it('retires a recorded model-list version when reinstalling on the Responses route', async () => {
    const preset: ProviderConfig = {
      id: 'test',
      label: 'Test',
      description: 'Test',
      protocol: AuthType.USE_OPENAI,
      baseUrl: 'https://api.test.com/v1',
      envKey: 'TEST_API_KEY',
      models: [{ id: 'model-a' }],
      modelNamePrefix: 'Test',
    };
    const adapter = createAdapter();
    const defaultPlan = buildInstallPlan(preset, {
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'sk-test',
      modelIds: ['model-a'],
    });
    expect(
      defaultPlan.providerState?.['providerMetadata.test']?.['version'],
    ).toBeDefined();

    const responsesPlan = buildInstallPlan(preset, {
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'sk-test',
      modelIds: ['model-a'],
      wireApi: 'responses',
    });
    await applyProviderInstallPlan(responsesPlan, { settings: adapter });

    // The drift check's template rebuild can never reproduce an api-stamped
    // install's version, so the reinstall must retire the version the
    // default-route install recorded — otherwise the next template change
    // prompts a spurious update whose accept path duplicates every model.
    expect(adapter.setValue).toHaveBeenCalledWith(
      'providerMetadata.test.version',
      undefined,
    );
  });

  it('offers only the provider just installed for conversation, keeping service routes', async () => {
    const baseUrl = 'http://new.example/v1';
    const oldUrl = 'http://old.example/v1';
    const envKey = generateCustomEnvKey(AuthType.USE_OPENAI, baseUrl);
    const oldKey = generateCustomEnvKey(AuthType.USE_OPENAI, oldUrl);
    const imageModel: ModelConfig = {
      id: 'image-model',
      name: 'image-model',
      baseUrl: oldUrl,
      envKey: oldKey,
      imageOnly: true,
    };
    const adapter = createAdapter({
      [AuthType.USE_OPENAI]: [
        { id: 'old-chat', name: 'old-chat', baseUrl: oldUrl, envKey: oldKey },
        imageModel,
      ],
      [AuthType.USE_ANTHROPIC]: [
        { id: 'claude-old', name: 'claude-old', envKey: 'ANTHROPIC_API_KEY' },
      ],
    });
    const reloadModelProviders = vi.fn();
    const plan = buildInstallPlan(customProvider, {
      protocol: AuthType.USE_OPENAI,
      baseUrl,
      apiKey: 'sk-new',
      modelIds: ['new-chat'],
    });

    try {
      await applyProviderInstallPlan(plan, {
        settings: adapter,
        syncAuthState: vi.fn(),
        reloadModelProviders,
        doRefreshAuth: false,
      });
    } finally {
      delete process.env[envKey];
    }

    // Maintainer decision: after /auth, /model lists the current provider's
    // conversation models only; earlier providers are not kept as history.
    const saved = adapter.getModelProviders();
    expect(saved[AuthType.USE_OPENAI]?.map((m) => m.id)).toEqual([
      'new-chat',
      'image-model',
    ]);
    expect(saved[AuthType.USE_ANTHROPIC]).toEqual([]);
    const runtime = reloadModelProviders.mock.calls.at(-1)?.[0] as
      | ModelProvidersConfig
      | undefined;
    expect(runtime?.[AuthType.USE_OPENAI]?.map((m) => m.id)).toEqual([
      'new-chat',
      'image-model',
    ]);
    expect(runtime?.[AuthType.USE_ANTHROPIC] ?? []).toEqual([]);
  });

  it('selects the installed endpoint and keeps no other conversation models', async () => {
    const baseUrl = 'http://new.example/v1';
    const otherBaseUrl = 'http://192.168.100.100:8000/v1';
    const envKey = generateCustomEnvKey(AuthType.USE_OPENAI, baseUrl);
    const otherEnvKey = generateCustomEnvKey(AuthType.USE_OPENAI, otherBaseUrl);
    const syncAuthState = vi.fn();
    const adapter = createAdapter({
      [AuthType.USE_OPENAI]: [
        // Same model id at another endpoint: the install selects its own.
        {
          id: 'model-b',
          name: 'model-b',
          baseUrl: otherBaseUrl,
          envKey: otherEnvKey,
        },
        { id: 'model-a', name: 'model-a', baseUrl, envKey },
        {
          id: 'shared-model',
          name: 'shared-model',
          baseUrl: otherBaseUrl,
          envKey: otherEnvKey,
        },
      ],
    });
    const plan = buildInstallPlan(customProvider, {
      protocol: AuthType.USE_OPENAI,
      baseUrl,
      apiKey: 'sk-new',
      modelIds: ['model-b'],
    });

    expect(plan.modelProviders?.[0]?.ownsModel).toBeUndefined();
    expect(plan.modelSelection).toEqual({ modelId: 'model-b', baseUrl });

    try {
      await applyProviderInstallPlan(plan, {
        settings: adapter,
        syncAuthState,
        doRefreshAuth: false,
      });
    } finally {
      delete process.env[envKey];
    }

    // Only what this install offers remains: the other endpoint's models and
    // the endpoint's own models the user did not pick are gone.
    expect(adapter.getModelProviders()[AuthType.USE_OPENAI]).toEqual([
      {
        id: 'model-b',
        name: 'model-b',
        baseUrl,
        envKey,
        credential: generateCustomCredentialId(AuthType.USE_OPENAI, baseUrl),
      },
    ]);
    expect(adapter.setValue).toHaveBeenCalledWith('model.name', 'model-b');
    expect(adapter.setValue).toHaveBeenCalledWith('model.baseUrl', baseUrl);
    expect(syncAuthState).toHaveBeenCalledWith(
      AuthType.USE_OPENAI,
      'model-b',
      baseUrl,
    );
  });

  it('writes provider state', async () => {
    const adapter = createAdapter();
    const plan: ProviderInstallPlan = {
      providerId: 'test-provider',
      authType: AuthType.USE_OPENAI,
      providerState: {
        codingPlan: {
          baseUrl: 'https://coding.example.com/v1',
          version: 'v1',
        },
      },
    };

    await applyProviderInstallPlan(plan, { settings: adapter });

    expect(adapter.setValue).toHaveBeenCalledWith(
      'codingPlan.baseUrl',
      'https://coding.example.com/v1',
    );
    expect(adapter.setValue).toHaveBeenCalledWith('codingPlan.version', 'v1');
  });

  it('appends models with append merge strategy', async () => {
    const adapter = createAdapter({
      [AuthType.USE_OPENAI]: [
        { id: 'existing-1', envKey: 'A' },
        { id: 'existing-2', envKey: 'B' },
      ],
    });
    const plan: ProviderInstallPlan = {
      providerId: 'test-provider',
      authType: AuthType.USE_OPENAI,
      modelProviders: [
        {
          authType: AuthType.USE_OPENAI,
          models: [{ id: 'new-model', envKey: 'C' }],
          mergeStrategy: 'append',
        },
      ],
    };

    await applyProviderInstallPlan(plan, { settings: adapter });

    expect(adapter.setValue).toHaveBeenCalledWith('modelProviders.openai', [
      { id: 'existing-1', envKey: 'A' },
      { id: 'existing-2', envKey: 'B' },
      { id: 'new-model', envKey: 'C' },
    ]);
  });

  it('replaces owned models with replace-owned strategy (appends new at end)', async () => {
    const adapter = createAdapter({
      [AuthType.USE_OPENAI]: [
        { id: 'owned-1', envKey: 'A' },
        { id: 'unrelated', envKey: 'B' },
        { id: 'owned-2', envKey: 'A' },
      ],
    });
    const plan: ProviderInstallPlan = {
      providerId: 'test-provider',
      authType: AuthType.USE_OPENAI,
      modelProviders: [
        {
          authType: AuthType.USE_OPENAI,
          models: [{ id: 'new-a', envKey: 'A' }],
          mergeStrategy: 'replace-owned',
          ownsModel: (model) => model.envKey === 'A',
        },
      ],
    };

    await applyProviderInstallPlan(plan, { settings: adapter });

    expect(adapter.setValue).toHaveBeenCalledWith('modelProviders.openai', [
      { id: 'unrelated', envKey: 'B' },
      { id: 'new-a', envKey: 'A' },
    ]);
  });

  const credentialPlan = (apiKey: string): ProviderInstallPlan => ({
    providerId: 'test-provider',
    authType: AuthType.USE_OPENAI,
    credential: { id: 'test-provider', apiKey },
  });

  it('restores the saved key on error', async () => {
    const adapter = createAdapter(
      {},
      createCredentialStore({ 'test-provider': 'old-value' }),
    );
    const refreshAuth = vi.fn(async () => {
      throw new Error('network error');
    });

    await expect(
      applyProviderInstallPlan(credentialPlan('new-value'), {
        settings: adapter,
        refreshAuth,
      }),
    ).rejects.toThrow('network error');

    expect(adapter.credentials.saved.get('test-provider')).toBe('old-value');
    expect(adapter.restore).toHaveBeenCalled();
  });

  it('removes the key on rollback if none was saved before', async () => {
    const adapter = createAdapter();
    const refreshAuth = vi.fn(async () => {
      throw new Error('fail');
    });

    await expect(
      applyProviderInstallPlan(credentialPlan('value'), {
        settings: adapter,
        refreshAuth,
      }),
    ).rejects.toThrow('fail');

    expect(adapter.credentials.saved.has('test-provider')).toBe(false);
  });

  // -- Rollback safety nets -------------------------------------------------
  // The catch path in applyProviderInstallPlan has three deliberate
  // safety nets that were previously untested. These tests pin them down so
  // a future refactor that "simplifies" the catch can't silently regress.

  it('restores runtime model providers when refreshAuth rejects after reloadModelProviders ran', async () => {
    const previousProviders = {
      [AuthType.USE_OPENAI]: [{ id: 'previous', envKey: 'OLD_KEY' }],
    };
    const adapter = createAdapter(previousProviders);
    const reloadModelProviders = vi.fn();
    const refreshAuth = vi.fn(async () => {
      throw new Error('refreshAuth rejected');
    });
    const plan: ProviderInstallPlan = {
      providerId: 'test-provider',
      authType: AuthType.USE_OPENAI,
      credential: { id: 'test-provider', apiKey: 'sk-new' },
      modelProviders: [
        {
          authType: AuthType.USE_OPENAI,
          models: [{ id: 'new-model', envKey: 'TEST_API_KEY' }],
          mergeStrategy: 'prepend-and-remove-owned',
          ownsModel: (model) => model.envKey === 'TEST_API_KEY',
        },
      ],
    };

    await expect(
      applyProviderInstallPlan(plan, {
        settings: adapter,
        reloadModelProviders,
        refreshAuth,
      }),
    ).rejects.toThrow('refreshAuth rejected');

    // Two reload calls: the success-path one with the patched providers,
    // then a rollback one that hands back the snapshot we took *before*
    // applying any patches.
    expect(reloadModelProviders).toHaveBeenCalledTimes(2);
    expect(reloadModelProviders).toHaveBeenLastCalledWith(previousProviders);
  });

  it('leaves the saved key alone when backup() throws before persist', async () => {
    const adapter = createAdapter(
      {},
      createCredentialStore({ 'test-provider': 'old-value' }),
    );
    adapter.backup.mockImplementation(() => {
      throw new Error('backup failed');
    });

    await expect(
      applyProviderInstallPlan(credentialPlan('new-value'), {
        settings: adapter,
      }),
    ).rejects.toThrow('backup failed');

    // backup() throwing inside the try must still hand control to the
    // catch path, and the key must be the one saved before the install.
    expect(adapter.credentials.saved.get('test-provider')).toBe('old-value');
  });

  it('continues the credential rollback even when settings.restore itself throws', async () => {
    const adapter = createAdapter(
      {},
      createCredentialStore({ 'test-provider': 'before-install' }),
    );
    adapter.restore.mockImplementation(() => {
      throw new Error('restore failed');
    });
    const refreshAuth = vi.fn(async () => {
      throw new Error('original error');
    });

    await expect(
      applyProviderInstallPlan(credentialPlan('during-install'), {
        settings: adapter,
        refreshAuth,
      }),
    ).rejects.toThrow('original error');

    // restore() throwing must not mask the original error and must not skip
    // the credential rollback that runs after it.
    expect(adapter.restore).toHaveBeenCalled();
    expect(adapter.credentials.saved.get('test-provider')).toBe(
      'before-install',
    );
  });

  it('annotates the rethrown error with the failing step and preserves the original cause', async () => {
    const adapter = createAdapter();
    const refreshAuth = vi.fn(async () => {
      throw new Error('endpoint unreachable');
    });
    const plan = credentialPlan('new');

    let caught: unknown;
    try {
      await applyProviderInstallPlan(plan, {
        settings: adapter,
        refreshAuth,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    // ProviderInstallError is a class, so instanceof works at runtime.
    expect(caught).toBeInstanceOf(ProviderInstallError);
    const err = caught as ProviderInstallError & { cause?: Error };
    // Step + authType are structured properties (not baked into the
    // user-facing message, which stays the underlying error text).
    expect(err.step).toBe('refreshAuth');
    expect(err.authType).toBe('openai');
    expect(err.message).toBe('endpoint unreachable');
    // Original error preserved via cause so callers matching on err.code
    // (NodeJS.ErrnoException) still work.
    expect(err.cause).toBeInstanceOf(Error);
    expect((err.cause as Error).message).toBe('endpoint unreachable');
  });

  it('continues throw + credential rollback when reloadModelProviders rollback itself throws', async () => {
    const previousProviders = {
      [AuthType.USE_OPENAI]: [{ id: 'previous', envKey: 'OLD' }],
    };
    const adapter = createAdapter(
      previousProviders,
      createCredentialStore({ 'test-provider': 'before' }),
    );
    let reloadCalls = 0;
    const reloadModelProviders = vi.fn(() => {
      reloadCalls += 1;
      if (reloadCalls === 2) {
        // The rollback-time reload (the second call) explodes.
        throw new Error('reload restore failed');
      }
    });
    const refreshAuth = vi.fn(async () => {
      throw new Error('original error');
    });
    await expect(
      applyProviderInstallPlan(credentialPlan('during'), {
        settings: adapter,
        reloadModelProviders,
        refreshAuth,
      }),
    ).rejects.toThrow('original error');

    // The rethrow must still carry the original error, the saved key must
    // still be rolled back, and the broken rollback reload must not mask
    // anything.
    expect(reloadModelProviders).toHaveBeenCalledTimes(2);
    expect(adapter.credentials.saved.get('test-provider')).toBe('before');
  });
});
