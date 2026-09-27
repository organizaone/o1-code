/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AuthType } from '@organizaone/o1-code-core';
import { writeCredential } from '@organizaone/o1-code-core/providers/credential-store.js';
import { vi } from 'vitest';
import { validateAuthMethod } from './auth.js';
import * as settings from './settings.js';

vi.mock('./settings.js', () => ({
  loadEnvironment: vi.fn(),
  loadSettings: vi.fn().mockReturnValue({
    merged: {},
  }),
}));

describe('validateAuthMethod', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset mock to default
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {},
    } as ReturnType<typeof settings.loadSettings>);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env['OPENAI_API_KEY'];
    delete process.env['CUSTOM_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY_ALTERED'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_BASE_URL'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_API_KEY_VERTEX'];
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['ACME_KEY'];
    delete process.env['TOKEN_PLAN_KEY'];
  });

  it('should return null for USE_OPENAI with default env key', () => {
    process.env['OPENAI_API_KEY'] = 'fake-key';
    expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
  });

  it('validates USE_OPENAI_RESPONSES with the default OpenAI API key', () => {
    process.env['OPENAI_API_KEY'] = 'fake-key';

    expect(validateAuthMethod(AuthType.USE_OPENAI_RESPONSES)).toBeNull();
  });

  it('reports the OpenAI API key requirement for USE_OPENAI_RESPONSES', () => {
    expect(validateAuthMethod(AuthType.USE_OPENAI_RESPONSES)).toBe(
      "Missing API key for OpenAI-compatible auth. Connect a provider with /auth, or set the 'OPENAI_API_KEY' environment variable.",
    );
  });

  it('should return an error message for USE_OPENAI if no API key is available', () => {
    expect(validateAuthMethod(AuthType.USE_OPENAI)).toBe(
      "Missing API key for OpenAI-compatible auth. Connect a provider with /auth, or set the 'OPENAI_API_KEY' environment variable.",
    );
  });

  it('no longer reads the legacy settings.security.auth.apiKey', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: { security: { auth: { apiKey: 'legacy-key' } } },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    expect(validateAuthMethod(AuthType.USE_GEMINI)).toBe(
      'GEMINI_API_KEY environment variable not found. Connect a provider with /auth, or set it in your .env file or environment variables.',
    );
  });

  it('should return null for USE_OPENAI with custom envKey from modelProviders', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'custom-model' },
        modelProviders: {
          openai: [{ id: 'custom-model', envKey: 'CUSTOM_API_KEY' }],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);
    process.env['CUSTOM_API_KEY'] = 'custom-key';

    expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
  });

  describe('with the credential store', () => {
    let home: string;
    beforeEach(() => {
      home = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-cli-auth-'));
      vi.stubEnv('O1CODE_HOME', home);
    });
    afterEach(() => {
      fs.rmSync(home, { recursive: true, force: true });
    });

    const savedEntry = (entry: Record<string, unknown>) =>
      vi.mocked(settings.loadSettings).mockReturnValue({
        merged: {
          model: { name: 'custom-model' },
          modelProviders: {
            openai: [
              { id: 'custom-model', envKey: 'CUSTOM_API_KEY', ...entry },
            ],
          },
        },
      } as unknown as ReturnType<typeof settings.loadSettings>);

    it('accepts the key saved under the credential the entry names', () => {
      writeCredential('my-gateway', { apiKey: 'saved-key' });
      savedEntry({ credential: 'my-gateway' });

      expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
    });

    it('accepts the key saved under the id of the matching provider', () => {
      writeCredential('deepseek', { apiKey: 'saved-key' });
      savedEntry({
        envKey: 'DEEPSEEK_API_KEY',
        baseUrl: 'https://api.deepseek.com',
      });

      expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
    });

    it('no longer reads a key stored in settings.env', () => {
      vi.mocked(settings.loadSettings).mockReturnValue({
        merged: {
          env: { CUSTOM_API_KEY: 'settings-env-key' },
          model: { name: 'custom-model' },
          modelProviders: {
            openai: [{ id: 'custom-model', envKey: 'CUSTOM_API_KEY' }],
          },
        },
      } as unknown as ReturnType<typeof settings.loadSettings>);

      expect(validateAuthMethod(AuthType.USE_OPENAI)).toContain(
        'CUSTOM_API_KEY',
      );
    });
  });

  it('uses providerProtocol mappings to find custom provider env keys', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'qwen3' },
        modelProviders: {
          acme: [{ id: 'qwen3', envKey: 'ACME_KEY' }],
        },
        providerProtocol: { acme: 'openai' },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);
    process.env['ACME_KEY'] = 'acme-key';

    expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
  });

  it('finds the canonical Responses entry during OpenAI preflight', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'gpt-model' },
        modelProviders: {
          openai: [
            { id: 'gpt-model', wireApi: 'responses', envKey: 'CUSTOM_API_KEY' },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);
    vi.stubEnv('CUSTOM_API_KEY', 'responses-key');

    expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
    expect(validateAuthMethod(AuthType.USE_OPENAI_RESPONSES)).toBeNull();
  });

  it('checks the effective API credential when both API routes share an id and URL', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'gpt-model', baseUrl: 'https://example.test/v1' },
        modelProviders: {
          openai: [
            {
              id: 'gpt-model',
              baseUrl: 'https://example.test/v1',
              wireApi: 'chat-completions',
              envKey: 'CHAT_KEY',
            },
            {
              id: 'gpt-model',
              baseUrl: 'https://example.test/v1',
              wireApi: 'responses',
              envKey: 'RESPONSES_KEY',
            },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);
    vi.stubEnv('CHAT_KEY', 'chat-key');
    vi.stubEnv('RESPONSES_KEY', '');

    expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
    expect(validateAuthMethod(AuthType.USE_OPENAI_RESPONSES)).toContain(
      "'RESPONSES_KEY'",
    );
  });

  it('disambiguates by settings.model.baseUrl when providers share a model id', () => {
    // Two providers with the same id; the persisted baseUrl selects the second.
    // Only the second provider's env key is set, so validation passes only if
    // the lookup honors baseUrl rather than matching the first id entry.
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: {
          name: 'qwen3.7-max',
          baseUrl: 'https://acme.example.com/v1',
        },
        modelProviders: {
          openai: [
            {
              id: 'qwen3.7-max',
              baseUrl: 'https://token-plan.example.com/v1',
              envKey: 'TOKEN_PLAN_KEY',
            },
            {
              id: 'qwen3.7-max',
              baseUrl: 'https://acme.example.com/v1',
              envKey: 'ACME_KEY',
            },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);
    process.env['ACME_KEY'] = 'acme-key';

    expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
  });

  it('reports the selected provider env key when providers share a model id', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: {
          name: 'qwen3.7-max',
          baseUrl: 'https://acme.example.com/v1',
        },
        modelProviders: {
          openai: [
            {
              id: 'qwen3.7-max',
              baseUrl: 'https://token-plan.example.com/v1',
              envKey: 'TOKEN_PLAN_KEY',
            },
            {
              id: 'qwen3.7-max',
              baseUrl: 'https://acme.example.com/v1',
              envKey: 'ACME_KEY',
            },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    // No env keys set → error must name the selected (Acme) provider's key.
    const result = validateAuthMethod(AuthType.USE_OPENAI);
    expect(result).toContain('ACME_KEY');
    expect(result).not.toContain('TOKEN_PLAN_KEY');
  });

  it('should return error with custom envKey hint when modelProviders envKey is set but env var is missing', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'custom-model' },
        modelProviders: {
          openai: [{ id: 'custom-model', envKey: 'CUSTOM_API_KEY' }],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    const result = validateAuthMethod(AuthType.USE_OPENAI);
    expect(result).toContain('CUSTOM_API_KEY');
  });

  it('should return null for USE_GEMINI with custom envKey', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'gemini-1.5-flash' },
        modelProviders: {
          gemini: [
            { id: 'gemini-1.5-flash', envKey: 'GEMINI_API_KEY_ALTERED' },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);
    process.env['GEMINI_API_KEY_ALTERED'] = 'altered-key';

    expect(validateAuthMethod(AuthType.USE_GEMINI)).toBeNull();
  });

  it('should return error with custom envKey for USE_GEMINI when env var is missing', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'gemini-1.5-flash' },
        modelProviders: {
          gemini: [
            { id: 'gemini-1.5-flash', envKey: 'GEMINI_API_KEY_ALTERED' },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    const result = validateAuthMethod(AuthType.USE_GEMINI);
    expect(result).toContain('GEMINI_API_KEY_ALTERED');
  });

  it('should return an error message for an invalid auth method', () => {
    expect(validateAuthMethod('invalid-method')).toBe(
      'Invalid auth method selected.',
    );
  });

  it('should return null for USE_ANTHROPIC with custom envKey and baseUrl', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'claude-3' },
        modelProviders: {
          anthropic: [
            {
              id: 'claude-3',
              envKey: 'CUSTOM_ANTHROPIC_KEY',
              baseUrl: 'https://api.anthropic.com',
            },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);
    process.env['CUSTOM_ANTHROPIC_KEY'] = 'custom-anthropic-key';

    expect(validateAuthMethod(AuthType.USE_ANTHROPIC)).toBeNull();
  });

  it('should return error for USE_ANTHROPIC when baseUrl is missing', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'claude-3' },
        modelProviders: {
          anthropic: [{ id: 'claude-3', envKey: 'CUSTOM_ANTHROPIC_KEY' }],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);
    process.env['CUSTOM_ANTHROPIC_KEY'] = 'custom-key';

    const result = validateAuthMethod(AuthType.USE_ANTHROPIC);
    expect(result).toContain('modelProviders[].baseUrl');
  });

  it('should return null for USE_VERTEX_AI with custom envKey', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'vertex-model' },
        modelProviders: {
          'vertex-ai': [
            { id: 'vertex-model', envKey: 'GOOGLE_API_KEY_VERTEX' },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);
    process.env['GOOGLE_API_KEY_VERTEX'] = 'vertex-key';

    expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBeNull();
  });

  it('should return null for USE_VERTEX_AI with a project and no API key', () => {
    process.env['GOOGLE_CLOUD_PROJECT'] = 'my-project';

    expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBeNull();
  });

  it('should return null for a keyless USE_VERTEX_AI modelProviders entry when a project is set', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        env: { GOOGLE_CLOUD_PROJECT: 'my-project' },
        model: { name: 'vertex-model' },
        modelProviders: {
          'vertex-ai': [{ id: 'vertex-model' }],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBeNull();
  });

  it('should return an error for USE_VERTEX_AI with neither an API key nor a project', () => {
    const result = validateAuthMethod(AuthType.USE_VERTEX_AI);

    expect(result).toContain('GOOGLE_API_KEY');
    // The first error a Vertex user hits must name the keyless alternative,
    // otherwise the advice is "set a key", which forces Express mode.
    expect(result).toContain('GOOGLE_CLOUD_PROJECT');
  });

  it('should keep requiring the declared envKey for USE_VERTEX_AI even when a project is set', () => {
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        env: { GOOGLE_CLOUD_PROJECT: 'my-project' },
        model: { name: 'vertex-model' },
        modelProviders: {
          'vertex-ai': [{ id: 'vertex-model', envKey: 'MY_VERTEX_KEY' }],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    const result = validateAuthMethod(AuthType.USE_VERTEX_AI);

    expect(result).toContain('MY_VERTEX_KEY');
    // The entry never takes the ADC path, so pointing at a project would be
    // advice that cannot work.
    expect(result).not.toContain('GOOGLE_CLOUD_PROJECT');
  });

  it('should not treat a whitespace-only project as configured', () => {
    process.env['GOOGLE_CLOUD_PROJECT'] = '   ';

    expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toContain(
      'GOOGLE_API_KEY',
    );
  });

  it('should use config.getModelsConfig().getModel() when Config is provided', () => {
    // Settings has a different model
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'settings-model' },
        modelProviders: {
          openai: [
            { id: 'settings-model', envKey: 'SETTINGS_API_KEY' },
            { id: 'cli-model', envKey: 'CLI_API_KEY' },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    // Mock Config object that returns a different model (e.g., from CLI args)
    const mockConfig = {
      getModelsConfig: vi.fn().mockReturnValue({
        getModel: vi.fn().mockReturnValue('cli-model'),
        getGenerationConfig: vi.fn().mockReturnValue({}),
      }),
    } as unknown as import('@organizaone/o1-code-core').Config;

    // Set the env key for the CLI model, not the settings model
    process.env['CLI_API_KEY'] = 'cli-key';

    // Should use 'cli-model' from config.getModelsConfig().getModel(), not 'settings-model'
    const result = validateAuthMethod(AuthType.USE_OPENAI, mockConfig);
    expect(result).toBeNull();
    expect(mockConfig.getModelsConfig).toHaveBeenCalled();
  });

  it('should fail validation when Config provides different model without matching env key', () => {
    // Clean up any existing env keys first
    delete process.env['CLI_API_KEY'];
    delete process.env['SETTINGS_API_KEY'];
    delete process.env['OPENAI_API_KEY'];

    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'settings-model' },
        modelProviders: {
          openai: [
            { id: 'settings-model', envKey: 'SETTINGS_API_KEY' },
            { id: 'cli-model', envKey: 'CLI_API_KEY' },
          ],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    const mockConfig = {
      getModelsConfig: vi.fn().mockReturnValue({
        getModel: vi.fn().mockReturnValue('cli-model'),
        getGenerationConfig: vi.fn().mockReturnValue({}),
      }),
    } as unknown as import('@organizaone/o1-code-core').Config;

    // Don't set CLI_API_KEY - validation should fail
    const result = validateAuthMethod(AuthType.USE_OPENAI, mockConfig);
    expect(result).not.toBeNull();
    expect(result).toContain('CLI_API_KEY');
  });

  // Regression test: validation must accept the API key resolved
  // into generationConfig.apiKey (e.g. from --openai-api-key) instead of
  // requiring an OPENAI_API_KEY env var.
  it('should accept API key resolved into generationConfig from CLI flag', () => {
    delete process.env['OPENAI_API_KEY'];
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {},
    } as unknown as ReturnType<typeof settings.loadSettings>);

    const mockConfig = {
      getModelsConfig: vi.fn().mockReturnValue({
        getModel: vi.fn().mockReturnValue('gpt-4'),
        getGenerationConfig: vi
          .fn()
          .mockReturnValue({ apiKey: 'cli-provided-key' }),
      }),
    } as unknown as import('@organizaone/o1-code-core').Config;

    const result = validateAuthMethod(AuthType.USE_OPENAI, mockConfig);
    expect(result).toBeNull();
  });

  // Regression test: when a modelProvider has a custom envKey but
  // the user passes --openai-api-key on the CLI, the resolver picks the CLI
  // value. Validation should match the resolver and accept it instead of
  // demanding the env var.
  it('should accept CLI-resolved key even when modelProvider declares a custom envKey', () => {
    delete process.env['CUSTOM_API_KEY'];
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        model: { name: 'custom-model' },
        modelProviders: {
          openai: [{ id: 'custom-model', envKey: 'CUSTOM_API_KEY' }],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    const mockConfig = {
      getModelsConfig: vi.fn().mockReturnValue({
        getModel: vi.fn().mockReturnValue('custom-model'),
        getGenerationConfig: vi
          .fn()
          .mockReturnValue({ apiKey: 'cli-provided-key' }),
      }),
    } as unknown as import('@organizaone/o1-code-core').Config;

    const result = validateAuthMethod(AuthType.USE_OPENAI, mockConfig);
    expect(result).toBeNull();
  });

  it('should accept runtime-resolved settings key when modelProvider declares a custom envKey', () => {
    delete process.env['CUSTOM_API_KEY'];
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        security: { auth: { apiKey: 'settings-fallback-key' } },
        model: { name: 'custom-model' },
        modelProviders: {
          openai: [{ id: 'custom-model', envKey: 'CUSTOM_API_KEY' }],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    const mockConfig = {
      getModelsConfig: vi.fn().mockReturnValue({
        getModel: vi.fn().mockReturnValue('custom-model'),
        getGenerationConfig: vi
          .fn()
          .mockReturnValue({ apiKey: 'settings-fallback-key' }),
      }),
    } as unknown as import('@organizaone/o1-code-core').Config;

    const result = validateAuthMethod(AuthType.USE_OPENAI, mockConfig);
    expect(result).toBeNull();
  });

  it('should keep no-config validation strict for missing custom envKey', () => {
    delete process.env['CUSTOM_API_KEY'];
    vi.mocked(settings.loadSettings).mockReturnValue({
      merged: {
        security: { auth: { apiKey: 'settings-fallback-key' } },
        model: { name: 'custom-model' },
        modelProviders: {
          openai: [{ id: 'custom-model', envKey: 'CUSTOM_API_KEY' }],
        },
      },
    } as unknown as ReturnType<typeof settings.loadSettings>);

    const result = validateAuthMethod(AuthType.USE_OPENAI);
    expect(result).toContain('CUSTOM_API_KEY');
  });
});
