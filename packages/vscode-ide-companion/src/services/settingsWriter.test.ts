/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetGlobalSettingsPath } = vi.hoisted(() => ({
  mockGetGlobalSettingsPath: vi.fn(),
}));

vi.mock('@organizaone/o1-code-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@organizaone/o1-code-core')>();
  return {
    ...actual,
    applyProviderInstallPlan: vi.fn(actual.applyProviderInstallPlan),
    Storage: {
      ...actual.Storage,
      getGlobalSettingsPath: mockGetGlobalSettingsPath,
    },
  };
});

import {
  AuthType,
  applyProviderInstallPlan,
  buildInstallPlan,
  customProvider,
  generateCustomEnvKey,
  getModelsForProviderProtocol,
  ModelRegistry,
  type ModelProvidersConfig,
  CODING_PLAN_GLOBAL_BASE_URL,
  type ProviderInstallPlan,
} from '@organizaone/o1-code-core';
import {
  readCredential,
  writeCredential,
} from '@organizaone/o1-code-core/providers/credential-store.js';
import { CODING_PLAN_ENV_KEY } from './subscriptionPlanDefinitions.js';
import {
  applyProviderInstallPlanToFile,
  clearPersistedAuth,
  readO1CodeSettingsForVSCode,
  restoreCredential,
  restoreSettingsSnapshot,
  resolveProviderSettings,
  snapshotCredential,
  snapshotSettingsForRollback,
  writeCodingPlanConfig,
  writeModelProvidersConfig,
} from './settingsWriter.js';

describe('settingsWriter', () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'o1-code-vscode-settings-'),
    );
    settingsPath = path.join(tempDir, '.o1-code', 'settings.json');
    mockGetGlobalSettingsPath.mockReturnValue(settingsPath);
    // Installs save keys under <O1CODE_HOME>/credentials.
    process.env['O1CODE_HOME'] = path.join(tempDir, '.o1-code');
  });

  afterEach(() => {
    delete process.env['O1CODE_HOME'];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each(
    [AuthType.USE_OPENAI, AuthType.USE_ANTHROPIC].flatMap((protocol) =>
      [true, false].flatMap((rotate) =>
        ['shell', 'settings'].map((source) => ({ protocol, rotate, source })),
      ),
    ),
  )(
    'preserves credential placeholders for $protocol (rotate=$rotate, source=$source)',
    async ({ protocol, rotate, source }) => {
      const baseUrl = 'https://rotation.example/v1';
      const envKey = generateCustomEnvKey(protocol, baseUrl);
      const placeholder = '${' + envKey + '}';
      vi.stubEnv(envKey, source === 'shell' ? 'test-only-old' : undefined);
      const raw = {
        env: { [envKey]: 'test-only-old' },
        modelProviders: {
          [protocol]: ['selected', 'sibling'].map((id) => ({
            id,
            name: id,
            baseUrl,
            envKey,
            generationConfig: { customHeaders: { 'X-Key': placeholder } },
          })),
        },
      };
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(raw));
      try {
        const apiKey = rotate ? 'test-only-new' : 'test-only-old';
        const view = resolveProviderSettings(raw);
        const plan = buildInstallPlan(
          customProvider,
          { protocol, baseUrl, modelIds: ['selected'], apiKey },
          getModelsForProviderProtocol(
            view['modelProviders'] as ModelProvidersConfig,
            protocol,
          ),
        );
        await applyProviderInstallPlanToFile(plan);
        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        // The key goes to the credential store; settings.env keeps what it
        // had and the selected entry names the saved credential.
        expect(saved.env[envKey]).toBe('test-only-old');
        expect(readCredential(plan.credential!.id)?.apiKey).toBe(apiKey);
        // Conversation installs retain only the selected provider's models.
        expect(saved.modelProviders[protocol]).toEqual([
          {
            ...raw.modelProviders[protocol][0],
            credential: plan.credential!.id,
          },
        ]);
        const result = await vi.mocked(applyProviderInstallPlan).mock
          .results[0]!.value;
        expect(result.updatedModelProviders[protocol]).toHaveLength(1);
        // Header placeholders read the environment: a variable the user set
        // wins; an unset one receives the new key for this process.
        for (const model of result.updatedModelProviders[protocol]!) {
          expect(model.generationConfig?.customHeaders?.['X-Key']).toBe(
            source === 'shell' ? 'test-only-old' : apiKey,
          );
        }
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it.each(['shell', 'settings'])(
    'reconfigures a released route with %s placeholders without leaving a stale winner',
    async (source) => {
      const env = {
        VSCODE_COMPAT_URL: 'https://compat.example/v1',
        VSCODE_COMPAT_ID: 'saved',
        VSCODE_COMPAT_REF: 'VSCODE_COMPAT_KEY',
        VSCODE_COMPAT_KEY: 'test-only-old',
      };
      for (const [key, value] of Object.entries(env)) {
        vi.stubEnv(key, source === 'shell' ? value : undefined);
      }
      const rawModel = {
        id: '${VSCODE_COMPAT_ID}',
        baseUrl: '${VSCODE_COMPAT_URL}',
        envKey: '${VSCODE_COMPAT_REF}',
        generationConfig: {
          customHeaders: { 'X-Key': '${VSCODE_COMPAT_KEY}' },
        },
      };
      const sibling = {
        id: 'keep',
        baseUrl: 'https://sibling.example/v1',
        envKey: 'SIBLING_KEY',
        generationConfig: {
          customHeaders: { 'X-Key': '${VSCODE_COMPAT_KEY}' },
        },
      };
      const raw = {
        $version: 4,
        env: source === 'settings' ? env : {},
        modelProviders: { 'openai-responses': [rawModel, sibling] },
      };
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(raw));
      try {
        const view = resolveProviderSettings(raw);
        const plan = buildInstallPlan(
          customProvider,
          {
            wireApi: 'responses',
            baseUrl: env.VSCODE_COMPAT_URL,
            modelIds: ['saved'],
            apiKey: 'test-only-new',
          },
          getModelsForProviderProtocol(
            view['modelProviders'] as ModelProvidersConfig,
            AuthType.USE_OPENAI,
          ),
        );
        // The kept env key gets a saved credential of its own.
        expect(plan.credential).toEqual({
          id: 'env-vscode-compat-key',
          apiKey: 'test-only-new',
        });
        await applyProviderInstallPlanToFile(plan);
        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        expect(saved.modelProviders['openai-responses']).toEqual([]);
        expect(saved.modelProviders.openai[0]).toMatchObject({
          ...rawModel,
          wireApi: 'responses',
          credential: 'env-vscode-compat-key',
        });
        expect(saved.env).toEqual(source === 'settings' ? env : {});
        expect(readCredential('env-vscode-compat-key')?.apiKey).toBe(
          'test-only-new',
        );
        const result = await vi.mocked(applyProviderInstallPlan).mock
          .results[0]!.value;
        // Header placeholders read the environment: the user's variable wins;
        // an unset one receives the new key for this process.
        const headerKey =
          source === 'shell' ? 'test-only-old' : 'test-only-new';
        expect(
          result.updatedModelProviders.openai?.[0]?.generationConfig
            ?.customHeaders?.['X-Key'],
        ).toBe(headerKey);
        const registry = new ModelRegistry(result.updatedModelProviders);
        expect(
          registry.getModel(
            AuthType.USE_OPENAI_RESPONSES,
            'saved',
            env.VSCODE_COMPAT_URL,
          ),
        ).toMatchObject({
          envKey: 'VSCODE_COMPAT_KEY',
          credential: 'env-vscode-compat-key',
          generationConfig: { customHeaders: { 'X-Key': headerKey } },
        });
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it.each([true, false])(
    'removes an identical released duplicate without placeholders (legacy first=%s)',
    async (legacyFirst) => {
      vi.stubEnv('VSCODE_DUPLICATE_KEY', 'test-only-old');
      const model = {
        id: 'same',
        baseUrl: 'https://duplicate.example/v1',
        envKey: 'VSCODE_DUPLICATE_KEY',
      };
      const canonical = { ...model, wireApi: 'responses' };
      const modelProviders = legacyFirst
        ? { 'openai-responses': [model], openai: [canonical] }
        : { openai: [canonical], 'openai-responses': [model] };
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ $version: 4, modelProviders }),
      );
      try {
        const plan = buildInstallPlan(
          customProvider,
          {
            baseUrl: model.baseUrl,
            modelIds: ['same'],
            wireApi: 'responses',
            apiKey: 'test-only-new',
          },
          getModelsForProviderProtocol(modelProviders, AuthType.USE_OPENAI),
        );
        await applyProviderInstallPlanToFile(plan);
        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        expect(saved.modelProviders['openai-responses']).toEqual([]);
        expect(
          new ModelRegistry(saved.modelProviders).getModelsForAuthType(
            AuthType.USE_OPENAI_RESPONSES,
          ),
        ).toHaveLength(1);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it('persists the selected Coding Plan region metadata', () => {
    writeCodingPlanConfig('global', 'coding-plan-key');

    const settings = JSON.parse(
      fs.readFileSync(settingsPath, 'utf-8'),
    ) as Record<string, Record<string, Record<string, unknown>>>;

    expect(settings.providerMetadata?.['coding-plan']).toMatchObject({
      region: 'global',
      baseUrl: CODING_PLAN_GLOBAL_BASE_URL,
    });
  });

  it('clears stale coding plan metadata when writing api-key providers', () => {
    writeCodingPlanConfig('china', 'coding-plan-key');

    writeModelProvidersConfig({
      apiKey: 'manual-key',
      modelProviders: {
        'gpt-4o': 'https://api.openai.com/v1',
      },
      activeModel: 'gpt-4o',
    });

    const settings = JSON.parse(
      fs.readFileSync(settingsPath, 'utf-8'),
    ) as Record<string, unknown>;
    const modelProviders = settings.modelProviders as Record<string, unknown>;
    const openaiModels = modelProviders[AuthType.USE_OPENAI] as Array<
      Record<string, string>
    >;

    // Keys go to the credential store, never to settings.json.
    expect(settings.env).toBeUndefined();
    expect(fs.readFileSync(settingsPath, 'utf-8')).not.toContain('-key');
    expect(readCredential('openai')?.apiKey).toBe('manual-key');
    // Switching to an API key forgets the subscription plan keys.
    expect(readCredential('coding-plan')).toBeUndefined();
    expect(settings.codingPlan).toBeUndefined();
    expect(settings.model).toEqual({ name: 'gpt-4o' });
    // The new entry must be present
    expect(openaiModels[0]).toEqual({
      id: 'gpt-4o',
      name: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
      envKey: 'OPENAI_API_KEY',
      credential: 'openai',
    });
    // Non-target entries (Coding Plan) are preserved, not silently deleted
    const preserved = openaiModels.filter(
      (m) => m.envKey === CODING_PLAN_ENV_KEY,
    );
    expect(preserved.length).toBeGreaterThan(0);
  });

  it('preserves existing OpenAI models when the file is still in the reverted V5 shape', () => {
    // Simulate a settings.json migrated to $version: 5 (the { protocol, models }
    // wrapper) that the CLI v5->v4 migration has not yet rewritten. The
    // extension reads/writes directly, so findOpenaiModels must tolerate the V5
    // shape on read or the pre-existing user model is silently dropped.
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        $version: 5,
        modelProviders: {
          [AuthType.USE_OPENAI]: {
            protocol: 'openai',
            models: [
              {
                id: 'user-model',
                name: 'user-model',
                baseUrl: 'https://api.example.com/v1',
                envKey: 'OPENAI_API_KEY',
              },
            ],
          },
        },
      }),
    );

    writeCodingPlanConfig('china', 'coding-plan-key');

    const settings = JSON.parse(
      fs.readFileSync(settingsPath, 'utf-8'),
    ) as Record<string, unknown>;
    const modelProviders = settings.modelProviders as Record<string, unknown>;
    const openaiModels = modelProviders[AuthType.USE_OPENAI] as Array<
      Record<string, string>
    >;

    // The pre-existing user model must survive the coding-plan write, and the
    // result is written back in the V4 array shape.
    expect(Array.isArray(openaiModels)).toBe(true);
    expect(openaiModels.some((m) => m.id === 'user-model')).toBe(true);
  });

  it('reads an api-key configuration after switching away from coding plan', () => {
    writeCodingPlanConfig('china', 'coding-plan-key');

    writeModelProvidersConfig({
      apiKey: 'manual-key',
      modelProviders: {
        'gpt-4o': 'https://api.openai.com/v1',
      },
      activeModel: 'gpt-4o',
    });

    expect(readO1CodeSettingsForVSCode()).toEqual({
      provider: 'api-key',
      apiKey: 'manual-key',
      codingPlanRegion: 'china',
    });
  });

  describe('applyProviderInstallPlanToFile', () => {
    it('saves the key in the credential store and the rest in settings.json', async () => {
      const plan: ProviderInstallPlan = {
        providerId: 'test',
        authType: AuthType.USE_OPENAI,
        credential: { id: 'test', apiKey: 'sk-test' },
        modelSelection: { modelId: 'gpt-4o' },
        modelProviders: [
          {
            authType: AuthType.USE_OPENAI,
            models: [
              { id: 'gpt-4o', envKey: 'TEST_API_KEY', credential: 'test' },
            ],
            mergeStrategy: 'prepend-and-remove-owned',
            ownsModel: (m) => m.envKey === 'TEST_API_KEY',
          },
        ],
      };

      await applyProviderInstallPlanToFile(plan);

      const written = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(written.env).toBeUndefined();
      expect(readCredential('test')?.apiKey).toBe('sk-test');
      expect(written.security.auth.selectedType).toBe(AuthType.USE_OPENAI);
      expect(written.model.name).toBe('gpt-4o');
      expect(written.modelProviders[AuthType.USE_OPENAI]).toEqual([
        { id: 'gpt-4o', envKey: 'TEST_API_KEY', credential: 'test' },
      ]);
    });

    it('strips a runtime snapshot prefix before persisting model.name', async () => {
      const plan: ProviderInstallPlan = {
        providerId: 'test',
        authType: AuthType.USE_OPENAI,
        // A runtime snapshot id must never reach disk — the adapter's setValue
        // guard strips it back to the bare model id.
        modelSelection: { modelId: '$runtime|openai|gpt-4o' },
        modelProviders: [
          {
            authType: AuthType.USE_OPENAI,
            models: [{ id: 'gpt-4o', envKey: 'TEST_API_KEY' }],
            mergeStrategy: 'prepend-and-remove-owned',
            ownsModel: (m) => m.envKey === 'TEST_API_KEY',
          },
        ],
      };

      await applyProviderInstallPlanToFile(plan);

      const written = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(written.model.name).toBe('gpt-4o');
    });

    it('collapses stacked runtime snapshot prefixes before persisting model.name', async () => {
      const plan: ProviderInstallPlan = {
        providerId: 'test',
        authType: AuthType.USE_OPENAI,
        modelSelection: { modelId: '$runtime|openai|$runtime|openai|gpt-4o' },
        modelProviders: [
          {
            authType: AuthType.USE_OPENAI,
            models: [{ id: 'gpt-4o', envKey: 'TEST_API_KEY' }],
            mergeStrategy: 'prepend-and-remove-owned',
            ownsModel: (m) => m.envKey === 'TEST_API_KEY',
          },
        ],
      };

      await applyProviderInstallPlanToFile(plan);

      const written = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(written.model.name).toBe('gpt-4o');
    });

    // The file adapter's setValue guards are exercised through provider
    // state, the plan field that writes arbitrary dotted keys.
    it('rejects __proto__ in install-plan keys (prototype-pollution guard)', async () => {
      // {__proto__: 'x'} literal sets the object's prototype rather than a
      // real property, so build the entries via defineProperty to land an
      // actual "__proto__" own-property that survives Object.entries.
      const fields: Record<string, string> = {};
      Object.defineProperty(fields, '__proto__', {
        value: 'polluted',
        enumerable: true,
        writable: true,
        configurable: true,
      });
      const plan: ProviderInstallPlan = {
        providerId: 'evil',
        authType: AuthType.USE_OPENAI,
        providerState: { env: fields },
      };

      await expect(applyProviderInstallPlanToFile(plan)).rejects.toThrow(
        /reserved segment/,
      );
      // Ensure prototype was not polluted by the failed call
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('rejects writes that would overwrite an intermediate scalar segment', async () => {
      // Hand-edited settings with `env` as a string (legacy / mistake).
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ env: 'legacy-string' }),
        'utf-8',
      );
      const plan: ProviderInstallPlan = {
        providerId: 'test',
        authType: AuthType.USE_OPENAI,
        providerState: { env: { NEW_KEY: 'value' } },
      };

      await expect(applyProviderInstallPlanToFile(plan)).rejects.toThrow(
        /segment "env" is a string/,
      );
      // Original scalar must be untouched
      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(after.env).toBe('legacy-string');
    });

    it('throws on malformed settings file instead of silently overwriting it', async () => {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      // Note the broken bracket — neither comments nor trailing commas fix it.
      fs.writeFileSync(settingsPath, '{ "broken": [1, 2', 'utf-8');
      const plan: ProviderInstallPlan = {
        providerId: 'test',
        authType: AuthType.USE_OPENAI,
        providerState: { env: { K: 'v' } },
      };

      await expect(applyProviderInstallPlanToFile(plan)).rejects.toThrow();
      // Bad file is preserved, not silently clobbered with {}
      expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ "broken": [1, 2');
    });

    it('parses JSONC with trailing commas (and preserves comma inside strings)', async () => {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      // Comments + trailing commas + a string containing a literal ",]".
      const jsonc = `{
  // hand-edited
  "preserveMe": ",]",
  "list": [1, 2,],
}`;
      fs.writeFileSync(settingsPath, jsonc, 'utf-8');
      const plan: ProviderInstallPlan = {
        providerId: 'test',
        authType: AuthType.USE_OPENAI,
        providerState: { env: { K: 'v' } },
      };

      await applyProviderInstallPlanToFile(plan);

      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(after.preserveMe).toBe(',]'); // literal preserved, not corrupted
      expect(after.list).toEqual([1, 2]);
      expect(after.env.K).toBe('v');
    });

    it('treats \\uXXXX as a 6-char escape (no parser differential / key injection)', async () => {
      // If the JSONC string scanner stepped past the backslash with j+=2 for
      // every escape, `"` would leave `0022` in the buffer and the next
      // `"` would close the string early — letting an attacker inject extra
      // top-level keys (e.g. env.NODE_OPTIONS) into settings.json.
      // The corrected scanner consumes \uXXXX as 6 chars, so the value stays
      // a single string with a literal `"` in the middle.
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      const jsonc = `{
  // attempted injection
  "API_KEY": "sk-abc\\u0022,\\n\\"INJECTED\\": \\"pwned",
}`;
      fs.writeFileSync(settingsPath, jsonc, 'utf-8');
      const plan: ProviderInstallPlan = {
        providerId: 'test',
        authType: AuthType.USE_OPENAI,
        providerState: { env: { K: 'v' } },
      };

      await applyProviderInstallPlanToFile(plan);

      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // Value is preserved as a single string with the literal quote.
      expect(after.API_KEY).toBe('sk-abc",\n"INJECTED": "pwned');
      // No injected top-level key landed in the file.
      expect(after.INJECTED).toBeUndefined();
      expect(after.env.K).toBe('v');
    });

    it('writes atomically — no .tmp residue on success', async () => {
      const plan: ProviderInstallPlan = {
        providerId: 'test',
        authType: AuthType.USE_OPENAI,
        providerState: { env: { K: 'v' } },
      };
      await applyProviderInstallPlanToFile(plan);
      const dir = path.dirname(settingsPath);
      const leftovers = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('settings.json.') && f.endsWith('.tmp'));
      expect(leftovers).toEqual([]);
    });
  });

  describe('clearPersistedAuth', () => {
    it('clears the auth selection and plan metadata, leaving settings.env alone', () => {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      // Pre-populate a settings file representing a user who has used
      // multiple providers (so each preset's envKey is set) plus a
      // hand-set NODE_OPTIONS the clear must leave alone.
      const initial = {
        env: {
          OPENAI_API_KEY: 'sk-openai',
          DEEPSEEK_API_KEY: 'sk-deepseek',
          MINIMAX_API_KEY: 'sk-minimax',
          ZAI_API_KEY: 'sk-zai',
          MODELSCOPE_API_KEY: 'sk-modelscope',
          XAI_API_KEY: 'sk-xai',
          BAILIAN_CODING_PLAN_API_KEY: 'sk-coding',
          BAILIAN_TOKEN_PLAN_API_KEY: 'sk-token',
          O1CODE_CUSTOM_API_KEY_OPENAI_HTTPS_API_FOO_COM_ABC123DEF456:
            'sk-custom-1',
          O1CODE_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_BAR_COM_DEAD0BEEF000:
            'sk-custom-2',
          NODE_OPTIONS: '--max-old-space-size=8192',
        },
        security: { auth: { selectedType: 'openai' } },
        providerMetadata: {
          'coding-plan': { version: '1' },
          deepseek: { version: '1' },
          grok: { version: '2' },
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(initial, null, 2), 'utf-8');

      clearPersistedAuth();

      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // settings.env is not where keys live: the clear leaves it as it was
      // (the saved keys are removed from the credential store instead).
      expect(after.env).toEqual(initial.env);
      // selectedType is wiped.
      expect(after.security?.auth?.selectedType).toBeUndefined();
      // providerMetadata is empty (or only holds keys that weren't ours).
      expect(after.providerMetadata['coding-plan']).toBeUndefined();
      expect(after.providerMetadata['deepseek']).toBeUndefined();
      expect(after.providerMetadata['grok']).toBeUndefined();
    });

    it('is a no-op when no settings file exists', () => {
      // No settings file written — clear must not throw.
      expect(() => clearPersistedAuth()).not.toThrow();
    });

    it('removes the saved keys too', () => {
      writeCredential('deepseek', { apiKey: 'sk-deepseek' });
      writeCredential('custom-0123456789ab', { apiKey: 'sk-custom' });
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ security: { auth: { selectedType: 'openai' } } }),
      );

      clearPersistedAuth();

      expect(readCredential('deepseek')).toBeUndefined();
      expect(readCredential('custom-0123456789ab')).toBeUndefined();
    });
  });

  describe('reading the key for the VS Code settings', () => {
    it('reads the Coding Plan key from the credential store', () => {
      writeCodingPlanConfig('global', 'sk-sp-saved');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(settings.env).toBeUndefined();
      expect(readO1CodeSettingsForVSCode()).toEqual({
        provider: 'coding-plan',
        apiKey: 'sk-sp-saved',
        codingPlanRegion: 'global',
      });
    });

    it('ignores a key left in settings.env', () => {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          env: { OPENAI_API_KEY: 'sk-in-settings' },
          security: { auth: { selectedType: 'openai' } },
          modelProviders: {
            openai: [{ id: 'm', envKey: 'OPENAI_API_KEY' }],
          },
        }),
      );
      vi.stubEnv('OPENAI_API_KEY', undefined);
      try {
        expect(readO1CodeSettingsForVSCode()).toBeNull();
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('snapshotCredential / restoreCredential', () => {
    it('puts back the key saved before a failed install', () => {
      writeCredential('deepseek', { apiKey: 'sk-before' });
      const snapshot = snapshotCredential('deepseek');
      writeCredential('deepseek', { apiKey: 'sk-rejected' });

      restoreCredential(snapshot);

      expect(readCredential('deepseek')?.apiKey).toBe('sk-before');
    });

    it('removes a key that did not exist before', () => {
      const snapshot = snapshotCredential('gemini');
      writeCredential('gemini', { apiKey: 'sk-rejected' });

      restoreCredential(snapshot);

      expect(readCredential('gemini')).toBeUndefined();
    });
  });

  describe('snapshotSettingsForRollback / restoreSettingsSnapshot', () => {
    it('round-trips: snapshot → mutate → restore brings the old state back', () => {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      const original = {
        env: { OPENAI_API_KEY: 'sk-good' },
        security: { auth: { selectedType: 'openai' } },
      };
      fs.writeFileSync(
        settingsPath,
        JSON.stringify(original, null, 2),
        'utf-8',
      );

      const snapshot = snapshotSettingsForRollback();
      expect(snapshot).not.toBeNull();

      // Simulate a bad-credential install writing over the file.
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ env: { OPENAI_API_KEY: 'sk-bad' } }, null, 2),
        'utf-8',
      );

      restoreSettingsSnapshot(snapshot);

      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(after).toEqual(original);
    });

    it('snapshot returns null on a malformed file and restore is then a no-op', () => {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, '{ "broken": [1, 2', 'utf-8');

      const snapshot = snapshotSettingsForRollback();
      expect(snapshot).toBeNull();

      // No-op restore must not throw and must not clobber the file.
      expect(() => restoreSettingsSnapshot(snapshot)).not.toThrow();
      expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ "broken": [1, 2');
    });

    it('snapshot returns {} (not null) when no settings file exists', () => {
      // ENOENT → readSettings returns {}, so we get a valid empty snapshot
      // that restore can write (creating the file).
      const snapshot = snapshotSettingsForRollback();
      expect(snapshot).toEqual({});
    });
  });
});
