// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { actions, ownerGuard, ownerState } = vi.hoisted(() => {
  const ownerState = { version: 0 };
  return {
    actions: {
      getAuthProviders: vi.fn(),
      getLocalAuthServers: vi.fn(),
      installAuthProvider: vi.fn(),
    },
    ownerGuard: {
      capture: vi.fn(() => {
        const version = ownerState.version;
        return { isCurrent: () => ownerState.version === version };
      }),
    },
    ownerState,
  };
});

vi.mock('@organizaone/o1-code-web-shell/daemon-react-sdk', () => ({
  useWorkspaceActions: () => actions,
  useDaemonSessionOwnerGuard: () => ownerGuard,
}));

const { AuthMessage } = await import('./AuthMessage');
const { I18nProvider } = await import('../../i18n');

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  ownerState.version = 0;
  actions.installAuthProvider.mockReset().mockResolvedValue({
    v: 1,
    providerId: 'custom',
    providerLabel: 'Custom provider',
    authType: 'openai',
    message: 'Provider saved.',
  });
  actions.getAuthProviders.mockResolvedValue({
    v: 1,
    workspaceCwd: '/workspace',
    providers: [
      {
        id: 'custom-openai-compatible',
        label: 'Custom OpenAI',
        description: 'Custom OpenAI-compatible provider',
        protocol: 'openai',
        steps: [],
      },
    ],
    groups: [
      {
        id: 'custom',
        label: 'Custom',
        description: 'Custom providers',
        providerIds: ['custom-openai-compatible'],
      },
    ],
  });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

async function install(
  runtimeSync: 'applied' | 'deferred' | 'failed' | undefined,
) {
  actions.installAuthProvider.mockResolvedValue({
    v: 1,
    providerId: 'custom-openai-compatible',
    providerLabel: 'Custom OpenAI',
    authType: 'openai',
    message: 'Provider saved.',
    ...(runtimeSync ? { runtimeSync: { status: runtimeSync } } : {}),
  });
  return openAndSave();
}

async function openAndSave(
  setup?: (click: (text: string) => Promise<void>) => Promise<void>,
) {
  const onMessage = vi.fn();
  const onClose = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <I18nProvider language="en">
        <AuthMessage onMessage={onMessage} onClose={onClose} />
      </I18nProvider>,
    );
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const click = async (text: string) => {
    const target = Array.from(container?.querySelectorAll('button') ?? []).find(
      (item) => item.textContent?.trim().startsWith(text),
    );
    if (!target) {
      throw new Error(`Button ${text} not found in ${container?.textContent}`);
    }
    await act(async () => {
      target.click();
      await Promise.resolve();
    });
  };
  await click('Custom');
  await setup?.(click);
  await click('Save');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { onMessage, onClose };
}

describe('AuthMessage runtime provider sync', () => {
  it('closes after save and appends a warning when runtime sync failed', async () => {
    const { onMessage, onClose } = await install('failed');

    expect(onMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        'Provider saved.\n\nThe change was saved, but running sessions could not be refreshed.',
      ),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([undefined, 'applied', 'deferred'] as const)(
    'keeps the existing success message for runtime sync %s',
    async (status) => {
      const { onMessage, onClose } = await install(status);

      expect(onMessage).toHaveBeenCalledWith('Provider saved.');
      expect(onClose).toHaveBeenCalledOnce();
    },
  );

  it('ignores an install completion after the session owner changes', async () => {
    let resolveInstall:
      | ((value: {
          v: 1;
          providerId: string;
          providerLabel: string;
          authType: string;
          message: string;
        }) => void)
      | undefined;
    actions.installAuthProvider.mockReturnValue(
      new Promise((resolve) => {
        resolveInstall = resolve;
      }),
    );
    const { onMessage, onClose } = await openAndSave();

    ownerState.version += 1;
    await act(async () => {
      root?.render(
        <I18nProvider language="en">
          <AuthMessage onMessage={onMessage} onClose={onClose} />
        </I18nProvider>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      resolveInstall?.({
        v: 1,
        providerId: 'custom-openai-compatible',
        providerLabel: 'Custom OpenAI',
        authType: 'openai',
        message: 'Provider saved.',
      });
      await Promise.resolve();
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    const saveButton = Array.from(
      container?.querySelectorAll('button') ?? [],
    ).at(-1);
    expect(saveButton?.disabled).toBe(false);
  });
});

const MODELSTUDIO = {
  id: 'alibaba',
  label: 'Alibaba Cloud',
  description: 'Coding Plan, Token Plan, or Standard API Key',
};

/** The catalog shape the daemon serves, trimmed to a few providers. */
const GROUPED_CATALOG = {
  v: 1,
  workspaceCwd: '/workspace',
  providers: [
    {
      id: 'organizaone',
      label: 'OrganizaOne',
      description: 'Connect to OrganizaOne with your key',
      protocol: 'anthropic',
      steps: ['apiKey', 'models'],
    },
    {
      id: 'organizaone-login',
      label: 'Sign in with your account',
      description: 'Sign in to OrganizaOne in the browser',
      protocol: 'anthropic',
      comingSoon: true,
      steps: [],
    },
    {
      id: 'organizaone-aipp',
      label: 'aipp device code',
      description: 'Paste an aipp connection code',
      protocol: 'anthropic',
      comingSoon: true,
      steps: [],
    },
    {
      id: 'coding-plan',
      label: 'Coding Plan',
      description: 'For individual developers',
      protocol: 'openai',
      family: MODELSTUDIO,
      steps: ['apiKey'],
    },
    {
      id: 'token-plan',
      label: 'Token Plan',
      description: 'For teams and companies',
      protocol: 'openai',
      family: MODELSTUDIO,
      steps: ['apiKey'],
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      description: 'Claude · key from console.anthropic.com',
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      steps: ['apiKey', 'models'],
    },
    {
      id: 'ollama',
      label: 'Ollama',
      description: 'Models from Ollama on this machine',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      uiGroup: 'local',
      localProbe: { kind: 'ollama' },
      steps: ['models'],
    },
    {
      id: 'lmstudio',
      label: 'LM Studio',
      description: 'Models from LM Studio on this machine',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:1234/v1',
      uiGroup: 'local',
      localProbe: { kind: 'lmstudio' },
      steps: ['models'],
    },
    {
      id: 'local-openai',
      label: 'Other local server',
      description: 'Any OpenAI-compatible server on this machine',
      protocol: 'openai',
      uiGroup: 'local',
      steps: ['baseUrl', 'models'],
    },
    {
      id: 'custom-openai-compatible',
      label: 'Custom',
      description: 'Manually connect a provider',
      protocol: 'openai',
      steps: ['baseUrl', 'apiKey', 'models'],
    },
  ],
  groups: [
    {
      id: 'organizaone',
      label: 'OrganizaOne',
      description: 'Connect to OrganizaOne with your key',
      providerIds: ['organizaone', 'organizaone-login', 'organizaone-aipp'],
    },
    {
      id: 'apiKey',
      label: 'API key',
      description: 'Anthropic, OpenAI, Google Gemini, xAI and others',
      providerIds: ['coding-plan', 'token-plan', 'anthropic'],
    },
    {
      id: 'local',
      label: 'Local',
      description: 'Models running on this machine',
      providerIds: ['ollama', 'lmstudio', 'local-openai'],
    },
    {
      id: 'custom',
      label: 'Custom',
      description: 'Any URL, OpenAI-compatible or Anthropic',
      providerIds: ['custom-openai-compatible'],
    },
  ],
};

describe('AuthMessage groups', () => {
  const buttons = () =>
    Array.from(container?.querySelectorAll('button') ?? []).filter(
      (button) =>
        !['previous', 'next', 'save', 'look again'].includes(
          button.textContent!.toLowerCase(),
        ),
    );
  const buttonStartingWith = (text: string) =>
    Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.trim().startsWith(text),
    );
  const click = async (text: string) => {
    const target = buttonStartingWith(text);
    if (!target) {
      throw new Error(`Button ${text} not found in ${container?.textContent}`);
    }
    await act(async () => {
      target.click();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  const open = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <I18nProvider language="en">
          <AuthMessage onMessage={vi.fn()} onClose={vi.fn()} />
        </I18nProvider>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  beforeEach(() => {
    actions.getAuthProviders.mockResolvedValue(GROUPED_CATALOG);
    actions.getLocalAuthServers.mockReset().mockResolvedValue([
      {
        id: 'ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        running: true,
        models: ['llama3.2:3b', 'qwen3:8b'],
      },
      {
        id: 'lmstudio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        running: false,
        models: [],
      },
    ]);
  });

  it('opens on the four groups with their descriptions', async () => {
    await open();
    expect(buttons().map((button) => button.textContent)).toEqual([
      'OrganizaOneConnect to OrganizaOne with your key',
      'API keyAnthropic, OpenAI, Google Gemini, xAI and others',
      'LocalModels running on this machine',
      'CustomAny URL, OpenAI-compatible or Anthropic',
    ]);
  });

  it('translates the group names', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <I18nProvider language="zh-CN">
          <AuthMessage onMessage={vi.fn()} onClose={vi.fn()} />
        </I18nProvider>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(buttonStartingWith('本机')).toBeDefined();
    expect(buttonStartingWith('自定义')).toBeDefined();
  });

  it('shows the OrganizaOne key and the two coming-soon entries disabled', async () => {
    await open();
    await click('OrganizaOne');
    expect(buttonStartingWith('API key')?.disabled).toBe(false);
    for (const label of ['Sign in with your account', 'aipp device code']) {
      const entry = buttonStartingWith(label);
      expect(entry?.disabled).toBe(true);
      expect(entry?.textContent).toContain('coming soon');
    }
  });

  it('folds the plans into one Alibaba Cloud row and keeps the plan choice inside it', async () => {
    await open();
    await click('API key');
    expect(buttons()).toHaveLength(2);
    expect(buttonStartingWith('Alibaba Cloud')).toBeDefined();
    expect(buttonStartingWith('Coding Plan')).toBeUndefined();
    await click('Alibaba Cloud');
    expect(buttonStartingWith('Coding Plan')).toBeDefined();
    expect(buttonStartingWith('Token Plan')).toBeDefined();
    await click('Token Plan');
    expect(container?.textContent).toContain(
      'the key is saved in ~/.o1-code/credentials/, for your user only',
    );
  });

  it('asks the daemon for its local servers and disables the ones not running', async () => {
    await open();
    await click('Local');
    expect(actions.getLocalAuthServers).toHaveBeenCalledOnce();
    expect(buttonStartingWith('Ollama')?.textContent).toContain(
      'detected · 2 models',
    );
    expect(buttonStartingWith('LM Studio')?.disabled).toBe(true);
    expect(buttonStartingWith('LM Studio')?.textContent).toContain(
      'not running',
    );
    expect(buttonStartingWith('Other local server')?.disabled).toBe(false);
    await click('Look again');
    expect(actions.getLocalAuthServers).toHaveBeenCalledTimes(2);
  });

  it('installs a detected server with its models and no key', async () => {
    actions.installAuthProvider.mockResolvedValue({ message: 'Saved' });
    await open();
    await click('Local');
    await click('Ollama');
    const models = container?.querySelector<HTMLInputElement>(
      'input[aria-label="Model IDs"]',
    );
    expect(models?.value).toBe('llama3.2:3b, qwen3:8b');
    expect(container?.querySelector('input[type="password"]')).toBeNull();
    await click('next');
    expect(actions.installAuthProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        apiKey: '',
        modelIds: ['llama3.2:3b', 'qwen3:8b'],
      }),
    );
  });

  it('takes a port for another local server', async () => {
    actions.installAuthProvider.mockResolvedValue({ message: 'Saved' });
    await open();
    await click('Local');
    await click('Other local server');
    const input = container!.querySelector<HTMLInputElement>(
      'input[aria-label="Port"]',
    );
    expect(input).not.toBeNull();
    fillInput('Port', '8080');
    await click('next');
    fillInput('Model IDs', 'local-model');
    await click('next');
    expect(actions.installAuthProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'local-openai',
        baseUrl: 'http://127.0.0.1:8080/v1',
      }),
    );
  });
});

describe('AuthMessage API selection', () => {
  const reviewRows = () => {
    const rows = Array.from(container?.querySelectorAll('dl > div') ?? []);
    return rows.map((row) => [
      row.querySelector('dt')?.textContent ?? '',
      row.querySelector('dd')?.textContent ?? '',
    ]);
  };

  beforeEach(() => {
    actions.getAuthProviders.mockResolvedValue({
      v: 1,
      workspaceCwd: '/workspace',
      providers: [
        {
          id: 'custom-openai-compatible',
          label: 'Custom OpenAI',
          description: '',
          protocol: 'openai',
          protocolOptions: ['openai', 'anthropic', 'gemini'],
          steps: ['protocol', 'wireApi', 'models'],
          showAdvancedConfig: true,
          models: [{ id: 'same' }],
        },
      ],
      groups: [
        {
          id: 'custom',
          label: 'Custom',
          description: '',
          providerIds: ['custom-openai-compatible'],
        },
      ],
    });
    actions.installAuthProvider.mockResolvedValue({ message: 'Saved' });
  });

  it('previews canonical Responses routing and forwards the API selection', async () => {
    await openAndSave(async (click) => {
      await click('OpenAI-compatible');
      await click('Responses');
      await click('previous');
      await click('next');
      await click('next');
      expect(reviewRows()).toContainEqual(['Protocol', 'OpenAI-compatible']);
      expect(reviewRows()).toContainEqual(['API', 'Responses']);
    });
    expect(actions.installAuthProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'openai',
        wireApi: 'responses',
        modelIds: ['same'],
      }),
    );
  });

  it.each([false, true])(
    'updates only the default endpoint when changing API (custom URL=%s)',
    async (customUrl) => {
      actions.getAuthProviders.mockResolvedValue({
        v: 1,
        workspaceCwd: '/workspace',
        providers: [
          {
            id: 'custom-openai-compatible',
            label: 'Custom OpenAI',
            description: '',
            protocol: 'openai',
            protocolOptions: ['openai', 'anthropic'],
            steps: ['protocol', 'wireApi', 'baseUrl', 'models'],
            showAdvancedConfig: true,
            models: [{ id: 'same' }],
          },
        ],
        groups: [
          {
            id: 'custom',
            label: 'Custom',
            description: '',
            providerIds: ['custom-openai-compatible'],
          },
        ],
      });
      await openAndSave(async (click) => {
        // The custom group auto-starts its single provider at the protocol step.
        await click('OpenAI-compatible');
        if (customUrl) {
          await click('Chat Completions');
          await act(async () =>
            fillInput('Base URL', 'https://gateway.example/v1'),
          );
          await click('previous');
        }
        await click('Responses');
        // The Responses wire dials the /v1-less default endpoint (the pipeline
        // appends /v1/responses itself); the baseUrl step must show and submit
        // it, not the Chat Completions /v1 default.
        const input = container?.querySelector('input');
        expect(input?.getAttribute('placeholder')).toBe(
          'https://api.openai.com',
        );
        expect(input?.value).toBe(
          customUrl ? 'https://gateway.example/v1' : 'https://api.openai.com',
        );
        await click('next');
        await click('next');
        expect(reviewRows()).toContainEqual([
          'Base URL',
          customUrl ? 'https://gateway.example/v1' : 'https://api.openai.com',
        ]);
        expect(container?.textContent).not.toContain(
          'https://api.openai.com/v1',
        );
      });
      expect(actions.installAuthProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'openai',
          wireApi: 'responses',
          baseUrl: customUrl
            ? 'https://gateway.example/v1'
            : 'https://api.openai.com',
        }),
      );
    },
  );

  it('uses the displayed protocol index and omits API for Anthropic', async () => {
    await openAndSave(async (click) => {
      await click('Anthropic');
      await click('next');
      expect(reviewRows()).toContainEqual(['Protocol', 'Anthropic-compatible']);
      expect(reviewRows().map(([label]) => label)).not.toContain('API');
    });
    expect(actions.installAuthProvider).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'anthropic' }),
    );
    expect(actions.installAuthProvider.mock.calls[0][0]).not.toHaveProperty(
      'wireApi',
    );
  });
});

async function clickButton(text: string) {
  const button = Array.from(container!.querySelectorAll('button')).find(
    (item) => item.textContent?.trim().toLowerCase() === text.toLowerCase(),
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => button.click());
}

function fillInput(label: string, value: string) {
  const input =
    container!.querySelector<HTMLInputElement>(
      `input[aria-label="${label}"]`,
    ) ??
    Array.from(container!.querySelectorAll<HTMLInputElement>('input')).find(
      (item) =>
        container!.querySelector(`label[for="${item.id}"]`)?.textContent ===
        label,
    );
  if (!input) throw new Error(`Missing input: ${label}`);
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}

async function openAdvanced(wireApi?: 'responses' | 'chat-completions') {
  actions.getAuthProviders.mockResolvedValue({
    v: 1,
    workspaceCwd: '/workspace',
    providers: [
      {
        id: 'custom',
        label: 'Custom provider',
        description: '',
        protocol: 'openai',
        showAdvancedConfig: true,
        steps: [
          ...(wireApi ? ['wireApi'] : []),
          'baseUrl',
          'apiKey',
          'models',
          'advancedConfig',
        ],
      },
    ],
    groups: [
      {
        id: 'custom',
        label: 'Custom',
        description: '',
        providerIds: ['custom'],
      },
    ],
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onClose = vi.fn();
  await act(async () =>
    root!.render(
      <I18nProvider language="en">
        <AuthMessage onMessage={vi.fn()} onClose={onClose} />
      </I18nProvider>,
    ),
  );
  // The group row carries its description after the name.
  const customGroup = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent?.startsWith('Custom'),
  );
  if (!customGroup) throw new Error('Missing button: Custom');
  await act(async () => customGroup.click());
  if (wireApi)
    await clickButton(
      wireApi === 'responses' ? 'Responses' : 'Chat Completions',
    );
  fillInput('Base URL', 'https://models.example/v1');
  await clickButton('Next');
  fillInput('API Key', 'test-secret-do-not-display');
  await clickButton('Next');
  fillInput(
    'Model IDs',
    wireApi ? 'qwen3-asr-flash' : 'model-a, model-b, model-a',
  );
  await clickButton('Next');
  return { onClose };
}

describe('AuthMessage model configuration', () => {
  it.each(['responses', 'chat-completions'] as const)(
    'validates the voice API before saving (%s)',
    async (wireApi) => {
      await openAdvanced(wireApi);
      const trigger =
        container!.querySelector<HTMLElement>('[role="combobox"]')!;
      await act(async () =>
        trigger.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        ),
      );
      const voice = Array.from(
        document.querySelectorAll<HTMLElement>('[role="option"]'),
      ).find((option) => option.textContent?.trim() === 'Voice transcription');
      expect(voice).toBeDefined();
      await act(async () =>
        voice!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        ),
      );
      await clickButton('Next');
      if (wireApi === 'responses') {
        expect(
          container!.querySelector('[role="alert"]')?.textContent,
        ).toContain('OpenAI Chat Completions');
        expect(actions.installAuthProvider).not.toHaveBeenCalled();
      } else {
        await clickButton('Save');
        expect(actions.installAuthProvider).toHaveBeenCalledWith(
          expect.objectContaining({
            wireApi: 'chat-completions',
            advancedConfig: expect.objectContaining({ purpose: 'voice' }),
          }),
        );
      }
    },
  );

  it('reviews and saves token limits without exposing credentials or inventing settings', async () => {
    await openAdvanced();
    fillInput('Context window', '131072');
    fillInput('Maximum output tokens', '8192');
    await clickButton('Next');
    expect(container!.textContent).toContain('131072');
    expect(container!.textContent).toContain('8192');
    expect(container!.textContent).toContain('https://models.example/v1');
    expect(container!.textContent).not.toContain('test-secret');
    expect(container!.textContent).toContain('Set (hidden)');
    expect(container!.textContent).not.toContain('OPENAI_API_KEY');
    await clickButton('Save');
    expect(actions.installAuthProvider).toHaveBeenCalledWith({
      providerId: 'custom',
      protocol: 'openai',
      baseUrl: 'https://models.example/v1',
      apiKey: 'test-secret-do-not-display',
      modelIds: ['model-a', 'model-b'],
      advancedConfig: {
        replaceExisting: true,
        contextWindowSize: 131072,
        maxTokens: 8192,
      },
    });
  });

  it('submits explicit empty advanced configuration when controls are cleared', async () => {
    await openAdvanced();
    fillInput('Context window', '131072');
    fillInput('Maximum output tokens', '8192');
    fillInput('Context window', '');
    fillInput('Maximum output tokens', '');
    await clickButton('Next');
    await clickButton('Save');
    expect(actions.installAuthProvider.mock.calls[0][0].advancedConfig).toEqual(
      { replaceExisting: true },
    );
  });

  it.each(['0', '-1', '1.5', '10000001', '1e3', 'abc'])(
    'rejects invalid token limit %s without changing the input',
    async (value) => {
      await openAdvanced();
      const input = fillInput('Maximum output tokens', value);
      await clickButton('Next');
      expect(input.value).toBe(value);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(container!.querySelector('[role="alert"]')?.textContent).toContain(
        'whole number',
      );
      expect(actions.installAuthProvider).not.toHaveBeenCalled();
      expect(
        Array.from(container!.querySelectorAll('button')).some(
          (b) => b.textContent === 'Save',
        ),
      ).toBe(false);
    },
  );

  it('preserves limits across Back and Next and excludes disabled modalities', async () => {
    await openAdvanced();
    fillInput('Context window', '10000000');
    fillInput('Maximum output tokens', '1');
    const modality = container!.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="Enable modality"]',
    )!;
    await act(async () => modality.click());
    expect(container!.querySelectorAll('[role="checkbox"]')).toHaveLength(4);
    await act(async () => modality.click());
    await clickButton('Next');
    await clickButton('Previous');
    expect(
      container!.querySelector<HTMLInputElement>(
        'input[aria-label="Context window"]',
      )?.value,
    ).toBe('10000000');
    await clickButton('Next');
    await clickButton('Save');
    expect(actions.installAuthProvider.mock.calls[0][0].advancedConfig).toEqual(
      { replaceExisting: true, contextWindowSize: 10000000, maxTokens: 1 },
    );
  });
});
