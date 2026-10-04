import { describe, expect, it } from 'vitest';
import {
  buildAuthProviderCatalog,
  parseAuthProviderInstallRequest,
} from './auth-provider-helpers.js';

describe('auth provider catalog', () => {
  const catalog = buildAuthProviderCatalog('/workspace');
  const group = (id: string) =>
    catalog.groups.find((entry) => entry.id === id)?.providerIds;

  const descriptor = (id: string) =>
    catalog.providers.find((provider) => provider.id === id);

  it('offers the four groups of the connect dialog', () => {
    expect(
      catalog.groups.map(({ id, label, description }) => ({
        id,
        label,
        description,
      })),
    ).toEqual([
      {
        id: 'organizaone',
        label: 'OrganizaOne',
        description: 'Connect to OrganizaOne with your key',
      },
      {
        id: 'apiKey',
        label: 'API key',
        description: 'Anthropic, OpenAI, Google Gemini, xAI and others',
      },
      {
        id: 'local',
        label: 'Local',
        description: 'Models running on this machine',
      },
      {
        id: 'custom',
        label: 'Custom',
        description: 'Any URL, OpenAI-compatible or Anthropic',
      },
    ]);
  });

  it('lists each group in display order, the coming-soon entries included', () => {
    expect(group('organizaone')).toEqual([
      'organizaone',
      'organizaone-login',
      'organizaone-o1gw',
    ]);
    expect(group('apiKey')).toEqual([
      'coding-plan',
      'token-plan',
      'alibabaStandard',
      'anthropic',
      'deepseek',
      'gemini',
      'moonshot',
      'minimax',
      'modelscope',
      'openai',
      'grok',
      'zai',
    ]);
    expect(group('local')).toEqual(['ollama', 'lmstudio', 'local-openai']);
    expect(group('custom')).toEqual(['custom-openai-compatible']);
    for (const entry of catalog.groups) {
      for (const id of entry.providerIds) {
        expect(descriptor(id)).toBeDefined();
      }
    }
  });

  it('marks the coming-soon entries, the local probes and the Alibaba Cloud family', () => {
    expect(descriptor('organizaone-login')).toMatchObject({
      comingSoon: true,
      description:
        'Approve this device in your browser; the models come from OrganizaOne',
    });
    expect(descriptor('organizaone-o1gw')?.comingSoon).toBe(true);
    expect(descriptor('organizaone')?.comingSoon).toBeUndefined();
    expect(descriptor('ollama')?.localProbe).toEqual({ kind: 'ollama' });
    expect(descriptor('lmstudio')?.localProbe).toEqual({ kind: 'lmstudio' });
    expect(descriptor('local-openai')?.localProbe).toBeUndefined();
    expect(descriptor('token-plan')?.family).toEqual({
      id: 'alibaba',
      label: 'Alibaba Cloud',
      description: 'Coding Plan, Token Plan, or Standard API Key',
    });
    expect(descriptor('anthropic')?.family).toBeUndefined();
  });

  it('no longer lists OpenRouter or Requesty', () => {
    const ids = catalog.providers.map((provider) => provider.id);
    expect(ids).not.toContain('openrouter');
    expect(ids).not.toContain('requesty');
  });
});

describe('install requests without a key', () => {
  it('accepts a server on this machine without a key', () => {
    expect(
      parseAuthProviderInstallRequest({
        providerId: 'ollama',
        apiKey: '',
        modelIds: ['llama3.2:3b'],
      }),
    ).toMatchObject({ ok: true, value: { providerId: 'ollama', apiKey: '' } });
  });

  it('still requires a key for a provider that takes one', () => {
    expect(
      parseAuthProviderInstallRequest({
        providerId: 'deepseek',
        apiKey: ' ',
        modelIds: ['deepseek-v4-flash'],
      }),
    ).toMatchObject({ ok: false, code: 'invalid_request' });
  });
});

describe('base URLs of servers on this machine', () => {
  const install = (providerId: string, baseUrl: string) =>
    parseAuthProviderInstallRequest({
      providerId,
      apiKey: providerId === 'deepseek' ? 'sk-test' : '',
      baseUrl,
      modelIds: ['m'],
    });

  it.each([
    ['ollama', 'http://127.0.0.1:11434/v1'],
    ['lmstudio', 'http://127.0.0.1:1234/v1'],
    ['local-openai', 'http://localhost:8080/v1'],
    ['local-openai', 'http://[::1]:8000/v1'],
  ])('accepts the loopback base URL of %s', (providerId, baseUrl) => {
    expect(install(providerId, baseUrl)).toMatchObject({
      ok: true,
      value: { providerId },
    });
  });

  it('still refuses a private-network host for a local preset', () => {
    expect(
      install('local-openai', 'http://192.168.1.20:8080/v1'),
    ).toMatchObject({ ok: false, code: 'invalid_base_url' });
  });

  it('still refuses a loopback host for a remote provider', () => {
    expect(install('deepseek', 'http://127.0.0.1:8080/v1')).toMatchObject({
      ok: false,
      code: 'invalid_base_url',
    });
    expect(
      parseAuthProviderInstallRequest({
        providerId: 'custom-openai-compatible',
        apiKey: 'sk-test',
        baseUrl: 'http://localhost:8080/v1',
        modelIds: ['m'],
      }),
    ).toMatchObject({ ok: false, code: 'invalid_base_url' });
  });
});

const request = {
  providerId: 'custom-openai-compatible',
  protocol: 'openai',
  baseUrl: 'https://media.example/v1',
  apiKey: 'test-only',
  modelIds: ['qwen3-asr-flash'],
};
describe('custom service model purpose', () => {
  it('rejects Responses voice before installation', () => {
    expect(
      parseAuthProviderInstallRequest({
        ...request,
        wireApi: 'responses',
        advancedConfig: { purpose: 'voice' },
      }),
    ).toMatchObject({
      ok: false,
      code: 'invalid_voice_model',
      error: expect.stringContaining('Chat Completions'),
    });
    expect(
      parseAuthProviderInstallRequest({
        ...request,
        wireApi: 'chat-completions',
        advancedConfig: { purpose: 'voice' },
      }),
    ).toMatchObject({ ok: true });
  });

  it('defaults an omitted voice protocol to OpenAI', () => {
    expect(
      parseAuthProviderInstallRequest({
        ...request,
        protocol: undefined,
        advancedConfig: { purpose: 'voice' },
      }),
    ).toMatchObject({ ok: true });
  });
  it.each(['voice', 'image'])(
    'accepts %s and preserves it in the setup inputs',
    (purpose) => {
      expect(
        parseAuthProviderInstallRequest({
          ...request,
          advancedConfig: { purpose },
        }),
      ).toMatchObject({ ok: true, value: { advancedConfig: { purpose } } });
    },
  );
  it.each([
    { modelIds: [], advancedConfig: { purpose: 'image' } },
    { modelIds: undefined, advancedConfig: { purpose: 'image' } },
    { advancedConfig: { purpose: 'unknown' } },
    { providerId: 'minimax', advancedConfig: { purpose: 'image' } },
    { protocol: 'anthropic', advancedConfig: { purpose: 'voice' } },
    { modelIds: ['chat-model'], advancedConfig: { purpose: 'voice' } },
    { baseUrl: undefined, advancedConfig: { purpose: 'voice' } },
    {
      baseUrl: 'https://media.example/v1?key=secret',
      advancedConfig: { purpose: 'image' },
    },
    {
      baseUrl: 'https://media.example/v1#secret',
      advancedConfig: { purpose: 'image' },
    },
    {
      baseUrl: 'http://media.example/v1',
      advancedConfig: { purpose: 'image' },
    },
  ])('rejects unsupported purpose configuration: %j', (override) => {
    expect(
      parseAuthProviderInstallRequest({ ...request, ...override }),
    ).toMatchObject({ ok: false });
  });
});

describe('advanced form replacement', () => {
  it.each([true, false, 'true', 1, null, undefined])(
    'requires an explicit true boolean for %j',
    (replaceExisting) => {
      const parsed = parseAuthProviderInstallRequest({
        ...request,
        advancedConfig: { replaceExisting, contextWindowSize: 32768 },
      });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error('Request rejected');
      expect(parsed.value.advancedConfig).toEqual({
        ...(replaceExisting === true ? { replaceExisting: true } : {}),
        contextWindowSize: 32768,
      });
    },
  );
});
