/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setTimeout as settleInput } from 'node:timers/promises';
import {
  AuthDialog,
  AuthMenuList,
  buildApiKeyItems,
  buildFamilyItems,
  buildLocalItems,
  buildMainItems,
  buildOrganizaOneItems,
} from './AuthDialog.js';
import type { LocalServerProbe } from '@organizaone/o1-code-core/providers/local-servers.js';
import { MODELSTUDIO_FAMILY } from '@organizaone/o1-code-core/providers/presets/modelstudio-family.js';
import { glyphs } from '../glyphs.js';
import { LoadedSettings } from '../../config/settings.js';
import type { Settings } from '../../config/settingsSchema.js';
import type { Config } from '@organizaone/o1-code-core';
import { AuthType } from '@organizaone/o1-code-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { UIStateContext } from '../contexts/UIStateContext.js';
import { UIActionsContext } from '../contexts/UIActionsContext.js';
import type { UIState } from '../contexts/UIStateContext.js';
import type { UIActions } from '../contexts/UIActionsContext.js';

const discoverProviderModelsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(null),
);

vi.mock('@organizaone/o1-code-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@organizaone/o1-code-core')>()),
  discoverProviderModels: discoverProviderModelsMock,
}));

const NOTHING_RUNNING: LocalServerProbe[] = [
  {
    id: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    running: false,
    models: [],
  },
  {
    id: 'lmstudio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    running: false,
    models: [],
  },
];

const OLLAMA_RUNNING: LocalServerProbe[] = [
  {
    id: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    running: true,
    models: ['llama3.2:3b', 'qwen3:8b', 'gemma3:4b'],
  },
  NOTHING_RUNNING[1]!,
];

const probeLocalServersMock = vi.hoisted(() =>
  vi.fn(async (): Promise<LocalServerProbe[]> => []),
);

vi.mock(
  '@organizaone/o1-code-core/providers/local-servers.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/local-servers.js')
    >()),
    probeLocalServers: probeLocalServersMock,
  }),
);

vi.mock('../../generated/brand.js', () => ({
  BRAND: {
    productName: 'o1-code',
    displayName: 'O1-Code',
    organization: 'OrganizaOne',
    repoUrl: 'https://example.test/acme/tool',
  },
}));

type UIStateOverrides = Partial<UIState> & Partial<UIState['auth']>;

type UIActionsOverrides = Partial<UIActions> & Partial<UIActions['auth']>;

const createMockUIState = (overrides: UIStateOverrides = {}): UIState => {
  const baseState = {
    auth: {
      authError: null,
      isAuthDialogOpen: false,
      isAuthenticating: false,
      pendingAuthType: undefined,
      externalAuthState: null,
    },
  } as Partial<UIState>;

  return {
    ...baseState,
    ...overrides,
    auth: {
      ...baseState.auth,
      ...(overrides.auth ?? {}),
      authError: overrides.auth?.authError ?? overrides.authError ?? null,
      pendingAuthType:
        overrides.auth?.pendingAuthType ?? overrides.pendingAuthType,
    },
  } as UIState;
};

const createMockUIActions = (overrides: UIActionsOverrides = {}): UIActions => {
  const { auth, ...topLevelOverrides } = overrides;
  const authActions = {
    closeAuthDialog: vi.fn(),
    handleProviderSubmit: vi.fn(),
    setAuthState: vi.fn(),
    onAuthError: vi.fn(),
    openAuthDialog: vi.fn(),
    cancelAuthentication: vi.fn(),
    ...auth,
  } as UIActions['auth'];

  for (const key of Object.keys(topLevelOverrides) as Array<
    keyof UIActions['auth']
  >) {
    if (key in authActions) {
      Object.assign(authActions, {
        [key]: topLevelOverrides[key],
      });
      delete topLevelOverrides[key];
    }
  }

  return {
    auth: authActions,
    handleRetryLastPrompt: vi.fn(),
    ...topLevelOverrides,
  } as UIActions;
};

const renderAuthDialog = (
  settings: LoadedSettings,
  uiStateOverrides: UIStateOverrides = {},
  uiActionsOverrides: UIActionsOverrides = {},
  configAuthType: AuthType | undefined = undefined,
  configApiKey: string | undefined = undefined,
) => {
  const uiState = createMockUIState(uiStateOverrides);
  const uiActions = createMockUIActions(uiActionsOverrides);

  const mockConfig = {
    getAuthType: vi.fn(() => configAuthType),
    getContentGeneratorConfig: vi.fn(() => ({ apiKey: configApiKey })),
  } as unknown as Config;

  return renderWithProviders(
    <UIStateContext.Provider value={uiState}>
      <UIActionsContext.Provider value={uiActions}>
        <AuthDialog />
      </UIActionsContext.Provider>
    </UIStateContext.Provider>,
    { settings, config: mockConfig },
  );
};

/**
 * Type text into the terminal one character at a time.
 * Works around a Node 24.x + ink compatibility issue on Windows
 * where bulk stdin.write() may not propagate to TextInput correctly.
 */
const typeText = async (
  stdin: { write: (s: string) => void },
  text: string,
) => {
  const delay = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
  await settleInput(150);
  for (const char of text) {
    stdin.write(char);
    await delay(5);
  }
  await delay(30);
};

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const WAIT_FOR_TIMEOUT = 5000;

const expectSelectedOption = (frame: string | undefined, label: string) => {
  expect(frame).toMatch(
    new RegExp(`❯\\s*(?:\\d+\\.\\s*)?${escapeRegExp(label)}`),
  );
};

const waitForSelectedOption = async (
  lastFrame: () => string | undefined,
  label: string,
) => {
  await vi.waitFor(
    () => {
      expectSelectedOption(lastFrame(), label);
    },
    { timeout: WAIT_FOR_TIMEOUT },
  );
  await settleInput(150);
};

const waitForText = async (
  lastFrame: () => string | undefined,
  expectedText: string,
) => {
  await vi.waitFor(
    () => {
      expect(lastFrame()).toContain(expectedText);
    },
    { timeout: WAIT_FOR_TIMEOUT },
  );
};

const pressEnterAndWaitFor = async (
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
  expectedText: string,
) => {
  await settleInput(150);
  stdin.write('\r');
  await vi.waitFor(
    () => {
      expect(lastFrame()).toContain(expectedText);
    },
    { timeout: WAIT_FOR_TIMEOUT },
  );
  await settleInput(150);
};

const moveDownAndWaitForSelection = async (
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
  label: string,
) => {
  await settleInput(150);
  stdin.write('\u001b[B');
  await waitForSelectedOption(lastFrame, label);
};

const navigateToCustomProtocolSelect = async (
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
) => {
  await waitForSelectedOption(lastFrame, 'OrganizaOne');
  await moveDownAndWaitForSelection(stdin, lastFrame, 'API key');
  await moveDownAndWaitForSelection(stdin, lastFrame, 'Local');
  await moveDownAndWaitForSelection(stdin, lastFrame, 'Custom');
  await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › Protocol');
};

/** Main screen → API key list. */
const openApiKeyList = async (
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
) => {
  await waitForSelectedOption(lastFrame, 'OrganizaOne');
  await moveDownAndWaitForSelection(stdin, lastFrame, 'API key');
  await pressEnterAndWaitFor(stdin, lastFrame, 'Connect a provider › API key');
  await waitForSelectedOption(lastFrame, 'Alibaba Cloud');
};

/** Main screen → API key → Alibaba Cloud plans. */
const openModelStudioPlans = async (
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
) => {
  await openApiKeyList(stdin, lastFrame);
  await pressEnterAndWaitFor(stdin, lastFrame, 'API key › Alibaba Cloud');
  await waitForSelectedOption(lastFrame, 'Coding Plan');
};

const navigateToCustomBaseUrlInput = async (
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
) => {
  await navigateToCustomProtocolSelect(stdin, lastFrame);
  await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › API');
  await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › Base URL');
};

const navigateToCustomApiKeyInput = async (
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
) => {
  await navigateToCustomBaseUrlInput(stdin, lastFrame);
  await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › API Key');
};

const navigateToCustomModelIdInput = async (
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
  apiKey = 'sk-test',
) => {
  await navigateToCustomApiKeyInput(stdin, lastFrame);
  await typeText(stdin, apiKey);
  await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › Model IDs');
};

const navigateToCustomAdvancedConfig = async (
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
  apiKey = 'sk-test',
  modelIds = 'model-1,model-2',
) => {
  await navigateToCustomModelIdInput(stdin, lastFrame, apiKey);
  await typeText(stdin, modelIds);
  await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › Advanced Config');
};

const isUnreliableTuiInputEnvironment =
  process.platform === 'win32' || process.env['CI'] === 'true';
const itWhenTuiInputReliable = isUnreliableTuiInputEnvironment ? it.skip : it;

describe('AuthDialog', { timeout: 15000 }, () => {
  const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env['GEMINI_API_KEY'] = '';
    process.env['O1CODE_DEFAULT_AUTH_TYPE'] = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('frames the dialog in the brand colour with the title and the step', () => {
    const scope = { ui: { customThemes: {} }, mcpServers: {} };
    const settings = new LoadedSettings(
      { settings: scope, originalSettings: scope, path: '' },
      { settings: {}, originalSettings: {}, path: '' },
      {
        settings: { ...scope, security: { auth: { selectedType: undefined } } },
        originalSettings: {
          ...scope,
          security: { auth: { selectedType: undefined } },
        },
        path: '',
      },
      { settings: scope, originalSettings: scope, path: '' },
      true,
      new Set(),
    );
    const { lastFrame, unmount } = renderAuthDialog(settings);
    const rows = (lastFrame() ?? '').split('\n');
    expect(rows[0]!.trimStart().startsWith('╭')).toBe(true);
    expect(rows[2]).toContain('Connect a provider');
    expect(rows[2]).toContain('step 1');
    unmount();
  });

  it('links the terms and privacy notice of the repository in brand.json', () => {
    const scope = { ui: { customThemes: {} }, mcpServers: {} };
    const settings = new LoadedSettings(
      { settings: scope, originalSettings: scope, path: '' },
      { settings: {}, originalSettings: {}, path: '' },
      { settings: scope, originalSettings: scope, path: '' },
      { settings: scope, originalSettings: scope, path: '' },
      true,
      new Set(),
    );
    const { lastFrame, unmount } = renderAuthDialog(settings);
    const frame = (lastFrame() ?? '').replace(/[\s│]/g, '');
    expect(frame).toContain(
      'https://example.test/acme/tool/blob/main/docs/users/support/tos-privacy.md',
    );
    unmount();
  });

  describe('the four groups', () => {
    const emptySettings = () => {
      const scope = { ui: { customThemes: {} }, mcpServers: {} };
      return new LoadedSettings(
        { settings: scope, originalSettings: scope, path: '' },
        { settings: {}, originalSettings: {}, path: '' },
        { settings: scope, originalSettings: scope, path: '' },
        { settings: scope, originalSettings: scope, path: '' },
        true,
        new Set(),
      );
    };
    const renderList = (items: ReturnType<typeof buildApiKeyItems>) =>
      renderWithProviders(
        <AuthMenuList items={items} initialIndex={0} onSelect={vi.fn()} />,
        { settings: emptySettings() },
      );
    const rowsOf = (frame: string | undefined) =>
      (frame ?? '').split('\n').map((row) => row.trimEnd());

    it('opens on the four entries in order, with their descriptions', () => {
      probeLocalServersMock.mockReturnValueOnce(new Promise(() => {}));
      const { lastFrame, unmount } = renderAuthDialog(emptySettings());
      const frame = lastFrame() ?? '';
      const order = [
        'OrganizaOne',
        'Connect to OrganizaOne with your key',
        'API key',
        'Anthropic, OpenAI, Google Gemini, xAI and others',
        'Local',
        'Models running on this machine',
        'Custom',
        'Any URL, OpenAI-compatible or Anthropic',
      ].map((text) => frame.indexOf(text));
      expect(order.every((index) => index >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expectSelectedOption(frame, 'OrganizaOne');
      expect(frame).not.toContain('Third-party Providers');
      expect(frame).not.toContain('Alibaba ModelStudio');
      unmount();
    });

    it('probes the local servers once when the dialog opens', () => {
      probeLocalServersMock.mockReturnValueOnce(new Promise(() => {}));
      const { lastFrame, unmount } = renderAuthDialog(emptySettings());
      expect(probeLocalServersMock).toHaveBeenCalledTimes(1);
      expect(
        rowsOf(lastFrame()).find((row) => row.includes('Local')),
      ).toContain('… looking');
      unmount();
    });

    it('marks Local when Ollama answered', async () => {
      probeLocalServersMock.mockResolvedValueOnce(OLLAMA_RUNNING);
      const { lastFrame, unmount } = renderAuthDialog(emptySettings());
      await waitForText(lastFrame, 'Ollama detected');
      const localRow = rowsOf(lastFrame()).find((row) =>
        row.includes('Ollama detected'),
      );
      expect(localRow).toContain('Local');
      expect(localRow).toContain('●');
      expect(lastFrame()).not.toContain('… looking');
      unmount();
    });

    it('drops the badge when nothing answered', async () => {
      probeLocalServersMock.mockResolvedValueOnce(NOTHING_RUNNING);
      const { lastFrame, unmount } = renderAuthDialog(emptySettings());
      await vi.waitFor(() => {
        expect(lastFrame()).not.toContain('… looking');
      });
      expect(lastFrame()).not.toContain('detected');
      unmount();
    });

    it('builds the main entries with the Local badge from the probe', () => {
      expect(buildMainItems(null).map((item) => item.value)).toEqual([
        'organizaone',
        'apiKey',
        'local',
        'custom',
      ]);
    });

    it('lists the OrganizaOne key and the two coming-soon entries', () => {
      const items = buildOrganizaOneItems();
      expect(items.map((item) => item.value)).toEqual([
        'organizaone',
        'organizaone-login',
        'organizaone-aipp',
      ]);
      expect(items.map((item) => Boolean(item.unavailable))).toEqual([
        false,
        true,
        true,
      ]);
      expect(items[1]!.unavailable).toBe(
        'Coming soon: this path depends on the OrganizaOne server.',
      );
      const { lastFrame, unmount } = renderList(items);
      const rows = rowsOf(lastFrame());
      expect(rows.find((row) => row.includes('API key'))).not.toContain(
        'coming soon',
      );
      expect(
        rows.find((row) => row.includes('Sign in with your account')),
      ).toContain('coming soon');
      expect(rows.find((row) => row.includes('aipp device code'))).toContain(
        'coming soon',
      );
      unmount();
    });

    it('lists the API key providers alphabetically, one line each', () => {
      const items = buildApiKeyItems();
      const { lastFrame, unmount } = renderList(items);
      const rows = rowsOf(lastFrame()).filter((row) => row.trim());
      const labels = [
        ['Alibaba Cloud', 'Coding Plan, Token Plan, or Standard API Key'],
        ['Anthropic', 'Claude · key from console.anthropic.com'],
        ['DeepSeek', 'key from platform.deepseek.com'],
        ['Google Gemini', 'Gemini · key from aistudio.google.com'],
        ['Kimi (Moonshot)', 'key from platform.moonshot.ai'],
        ['MiniMax', 'key from platform.minimax.io'],
        ['ModelScope', 'key from modelscope.cn'],
        ['OpenAI', 'GPT · key from platform.openai.com'],
        ['xAI', 'Grok · key from console.x.ai'],
        ['Z.AI', 'key from z.ai'],
      ] as const;
      expect(rows).toHaveLength(labels.length);
      labels.forEach(([label, description], index) => {
        expect(rows[index]).toContain(label);
        if (description) expect(rows[index]).toContain(description);
      });
      expect(lastFrame()).not.toContain('OpenRouter');
      expect(lastFrame()).not.toContain('Requesty');
      expect(items[0]!.value).toBe(`family:${MODELSTUDIO_FAMILY.id}`);
      unmount();
    });

    it('keeps the Alibaba plan choice inside the Alibaba Cloud entry', () => {
      const { lastFrame, unmount } = renderList(
        buildFamilyItems(MODELSTUDIO_FAMILY),
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Coding Plan');
      expect(frame).toContain('Token Plan');
      expect(frame).toContain('Standard API Key');
      unmount();
    });

    it('shows the local servers as looking while the probe runs', () => {
      const items = buildLocalItems(null);
      const { lastFrame, unmount } = renderList(items);
      const rows = rowsOf(lastFrame());
      expect(rows.find((row) => row.includes('Ollama'))).toContain('… looking');
      expect(rows.find((row) => row.includes('LM Studio'))).toContain(
        '… looking',
      );
      expect(lastFrame()).toContain('Other local server');
      unmount();
    });

    it('marks a detected server and disables one that is not running', () => {
      const items = buildLocalItems(OLLAMA_RUNNING);
      expect(items.map((item) => item.value)).toEqual([
        'ollama',
        'lmstudio',
        'local-openai',
      ]);
      expect(items[0]!.unavailable).toBeUndefined();
      expect(items[1]!.unavailable).toBe(
        'Nothing answered on that port. Start the server and press ctrl+r.',
      );
      expect(items[2]!.unavailable).toBeUndefined();
      const { lastFrame, unmount } = renderList(items);
      const rows = rowsOf(lastFrame());
      expect(rows.find((row) => row.includes('Ollama'))).toContain(
        `${glyphs().dot} detected · 3 models`,
      );
      expect(rows.find((row) => row.includes('LM Studio'))).toContain(
        `${glyphs().hollow} not running`,
      );
      expect(lastFrame()).not.toMatch(/[☑☐]/u);
      unmount();
    });
  });

  it('should show an error if the initial auth type is invalid', () => {
    process.env['GEMINI_API_KEY'] = '';

    const settings: LoadedSettings = new LoadedSettings(
      {
        settings: { ui: { customThemes: {} }, mcpServers: {} },
        originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
        path: '',
      },
      {
        settings: {},
        originalSettings: {},
        path: '',
      },
      {
        settings: {
          security: {
            auth: {
              selectedType: AuthType.USE_GEMINI,
            },
          },
        },
        originalSettings: {
          security: {
            auth: {
              selectedType: AuthType.USE_GEMINI,
            },
          },
        },
        path: '',
      },
      {
        settings: { ui: { customThemes: {} }, mcpServers: {} },
        originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
        path: '',
      },
      true,
      new Set(),
    );

    const { lastFrame } = renderAuthDialog(settings, {
      auth: {
        ...createMockUIState().auth,
        authError: 'GEMINI_API_KEY  environment variable not found',
      },
    });

    expect(lastFrame()).toContain(
      'GEMINI_API_KEY  environment variable not found',
    );
  });

  describe('GEMINI_API_KEY environment variable', () => {
    it('should detect GEMINI_API_KEY environment variable', () => {
      process.env['GEMINI_API_KEY'] = 'foobar';

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { lastFrame } = renderAuthDialog(settings);

      // The dialog lists the provider groups; it shows no GEMINI_API_KEY
      // message.
      expect(lastFrame()).toContain('API key');
      expect(lastFrame()).not.toContain('GEMINI_API_KEY');
    });

    it('should not show the GEMINI_API_KEY message if O1CODE_DEFAULT_AUTH_TYPE is set to something else', () => {
      process.env['GEMINI_API_KEY'] = 'foobar';
      process.env['O1CODE_DEFAULT_AUTH_TYPE'] = AuthType.USE_OPENAI;

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { lastFrame } = renderAuthDialog(settings);

      expect(lastFrame()).not.toContain(
        'Existing API key detected (GEMINI_API_KEY)',
      );
    });

    it('should show the GEMINI_API_KEY message if O1CODE_DEFAULT_AUTH_TYPE is set to use api key', () => {
      process.env['GEMINI_API_KEY'] = 'foobar';
      process.env['O1CODE_DEFAULT_AUTH_TYPE'] = AuthType.USE_OPENAI;

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { lastFrame } = renderAuthDialog(settings);

      // The dialog lists the provider groups; it shows no GEMINI_API_KEY
      // message.
      expect(lastFrame()).toContain('API key');
      expect(lastFrame()).not.toContain('GEMINI_API_KEY');
    });
  });

  describe('O1CODE_DEFAULT_AUTH_TYPE environment variable', () => {
    it('should keep the default entry when O1CODE_DEFAULT_AUTH_TYPE is set', () => {
      // The env var is validated by useAuth, but it does not preselect an
      // entry in the provider dialog.
      process.env['O1CODE_DEFAULT_AUTH_TYPE'] = AuthType.USE_OPENAI;

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { lastFrame } = renderAuthDialog(settings);

      // The dialog lands on its first entry.
      expectSelectedOption(lastFrame(), 'OrganizaOne');
    });

    it('should fall back to default if O1CODE_DEFAULT_AUTH_TYPE is not set', () => {
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { lastFrame } = renderAuthDialog(settings);

      // Default is OrganizaOne (first option).
      expectSelectedOption(lastFrame(), 'OrganizaOne');
    });

    it('should show an error and fall back to default if O1CODE_DEFAULT_AUTH_TYPE is invalid', () => {
      process.env['O1CODE_DEFAULT_AUTH_TYPE'] = 'invalid-auth-type';

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { lastFrame } = renderAuthDialog(settings);

      // Since the auth dialog doesn't show O1CODE_DEFAULT_AUTH_TYPE errors anymore,
      // it will just land on its first entry.
      expectSelectedOption(lastFrame(), 'OrganizaOne');
    });
  });

  // ---------------------------------------------------------------------------
  // TUI input simulation tests — skipped on CI (process.env.CI=true)
  // These tests use stdin.write() to simulate keyboard navigation through
  // multi-step UI flows. On slower CI runners the timing between simulated
  // key presses and React re-renders is unreliable, causing flaky failures.
  // Local dev (macOS) retains full coverage.
  // ---------------------------------------------------------------------------

  itWhenTuiInputReliable(
    'should prevent exiting when no auth method is selected and show error message',
    async () => {
      const closeAuthDialog = vi.fn();
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { lastFrame, stdin, unmount } = renderAuthDialog(
        settings,
        {},
        { closeAuthDialog },
        undefined, // config.getAuthType() returns undefined
      );
      await waitForSelectedOption(lastFrame, 'OrganizaOne');

      // Simulate pressing escape key
      stdin.write('\u001b'); // ESC key

      // Should show error message instead of calling closeAuthDialog
      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('You must connect a provider to proceed');
          expect(frame).toContain('Press Ctrl+C again to exit');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );
      expect(closeAuthDialog).not.toHaveBeenCalled();
      unmount();
    },
  );

  itWhenTuiInputReliable(
    'should not exit if there is already an error message',
    async () => {
      const closeAuthDialog = vi.fn();
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { lastFrame, stdin, unmount } = renderAuthDialog(
        settings,
        {
          auth: {
            ...createMockUIState().auth,
            authError: 'Initial error',
          },
        },
        { closeAuthDialog },
        undefined, // config.getAuthType() returns undefined
      );
      await vi.waitFor(
        () => {
          expect(lastFrame()).toContain('Initial error');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      // Simulate pressing escape key
      stdin.write('\u001b'); // ESC key
      await wait();

      // Should not call closeAuthDialog
      expect(closeAuthDialog).not.toHaveBeenCalled();
      unmount();
    },
  );

  itWhenTuiInputReliable(
    'should allow exiting when auth method is already selected',
    async () => {
      const closeAuthDialog = vi.fn();
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: AuthType.USE_OPENAI } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: AuthType.USE_OPENAI } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(
        settings,
        {},
        { closeAuthDialog },
        AuthType.USE_OPENAI, // config.getAuthType() returns USE_OPENAI
      );
      await vi.waitFor(
        () => {
          expect(lastFrame()).toBeTruthy();
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      // Simulate pressing escape key
      stdin.write('\u001b'); // ESC key
      await wait();

      // Should call closeAuthDialog to exit
      expect(closeAuthDialog).toHaveBeenCalled();
      unmount();
    },
  );

  itWhenTuiInputReliable(
    'should preserve the selected main entry when returning from each top-level flow',
    async () => {
      const createSettings = () =>
        new LoadedSettings(
          {
            settings: { ui: { customThemes: {} }, mcpServers: {} },
            originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
            path: '',
          },
          {
            settings: {},
            originalSettings: {},
            path: '',
          },
          {
            settings: {
              security: { auth: { selectedType: undefined } },
              ui: { customThemes: {} },
              mcpServers: {},
            },
            originalSettings: {
              security: { auth: { selectedType: undefined } },
              ui: { customThemes: {} },
              mcpServers: {},
            },
            path: '',
          },
          {
            settings: { ui: { customThemes: {} }, mcpServers: {} },
            originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
            path: '',
          },
          true,
          new Set(),
        );

      const cases = [
        {
          label: 'OrganizaOne',
          childTitle: 'Connect a provider › OrganizaOne',
        },
        {
          label: 'API key',
          childTitle: 'Connect a provider › API key',
        },
        {
          label: 'Local',
          childTitle: 'Connect a provider › Local',
        },
        {
          label: 'Custom',
          childTitle: 'Custom › Protocol',
        },
      ];

      for (const testCase of cases) {
        const { stdin, lastFrame, unmount } =
          renderAuthDialog(createSettings());

        await waitForSelectedOption(lastFrame, 'OrganizaOne');
        while (
          !lastFrame()?.match(
            new RegExp(`❯\\s*(?:\\d+\\.\\s*)?${escapeRegExp(testCase.label)}`),
          )
        ) {
          stdin.write('\u001b[B');
          await wait();
        }
        await pressEnterAndWaitFor(stdin, lastFrame, testCase.childTitle);
        stdin.write('\u001b');
        await waitForSelectedOption(lastFrame, testCase.label);

        unmount();
      }
    },
  );

  itWhenTuiInputReliable(
    'should go back from Coding Plan region selection to the Alibaba Cloud plans',
    async () => {
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(settings);

      await openModelStudioPlans(stdin, lastFrame);
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Alibaba ModelStudio › Region',
      );
      expect(lastFrame()).toContain('step 4 of');
      stdin.write('\u001b');

      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('API key › Alibaba Cloud');
          expect(frame).toContain('step 3');
          expect(frame).toContain('Coding Plan');
          expect(frame).toContain('Token Plan');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'should go back from a provider API key input to the API key list',
    async () => {
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(settings);

      await openApiKeyList(stdin, lastFrame);
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Anthropic');
      await moveDownAndWaitForSelection(stdin, lastFrame, 'DeepSeek');
      await pressEnterAndWaitFor(stdin, lastFrame, 'DeepSeek › API Key');
      expect(lastFrame()).toContain('step 3 of');
      expect(lastFrame()).toContain(
        'the key is saved in ~/.o1-code/credentials/, for your user only',
      );
      stdin.write('\u001b');

      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('Connect a provider › API key');
          expectSelectedOption(frame, 'DeepSeek');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'should list the key providers under API key',
    async () => {
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(settings);

      await openApiKeyList(stdin, lastFrame);

      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('step 2');
          expect(frame).toContain('Anthropic');
          expect(frame).toContain('DeepSeek');
          expect(frame).not.toContain('OpenRouter');
          expect(frame).not.toContain('Requesty');
          expect(frame).not.toContain('Standard API Key');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'drives API key provider steps from endpoint options metadata',
    async () => {
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(settings);

      await openApiKeyList(stdin, lastFrame);
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Anthropic');
      await moveDownAndWaitForSelection(stdin, lastFrame, 'DeepSeek');
      await pressEnterAndWaitFor(stdin, lastFrame, 'DeepSeek › API Key');
      stdin.write('\u001b');
      await vi.waitFor(
        () => {
          expect(lastFrame()).toContain('Connect a provider › API key');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Google Gemini');
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Kimi (Moonshot)');
      await moveDownAndWaitForSelection(stdin, lastFrame, 'MiniMax');
      await pressEnterAndWaitFor(stdin, lastFrame, 'MiniMax › Endpoint');

      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('International');
          expect(frame).toContain('China');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'should show the Alibaba plans after selecting Alibaba Cloud',
    async () => {
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(settings);

      await openModelStudioPlans(stdin, lastFrame);

      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('Coding Plan');
          expect(frame).toContain('Token Plan');
          expect(frame).toContain(
            'Usage-based billing with dedicated endpoint',
          );
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'should submit Token Plan through the shared subscription handler',
    async () => {
      const handleProviderSubmit = vi.fn().mockResolvedValue(undefined);
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(
        settings,
        {},
        { handleProviderSubmit },
      );

      await openModelStudioPlans(stdin, lastFrame);
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Token Plan');
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Alibaba ModelStudio › Region',
      );
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Alibaba ModelStudio › API Key',
      );

      await typeText(stdin, 'sk-token-plan');

      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Alibaba ModelStudio › Model IDs',
      );
      await waitForText(lastFrame, 'Enter model IDs directly');
      stdin.write('\r');
      await vi.waitFor(
        () => {
          expect(handleProviderSubmit).toHaveBeenCalled();
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'should pre-fill the Model IDs step with previously saved custom model IDs',
    async () => {
      // User previously saved a custom model ID for Token Plan in settings.
      const savedSettings = {
        security: { auth: { selectedType: undefined } },
        ui: { customThemes: {} },
        mcpServers: {},
        modelProviders: {
          openai: [
            {
              id: 'my-custom-token-model',
              name: '[ModelStudio Token Plan] my-custom-token-model',
              baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
              envKey: 'BAILIAN_TOKEN_PLAN_API_KEY',
            },
          ],
        },
      } as unknown as Settings;
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: savedSettings,
          originalSettings: savedSettings,
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(settings);

      await openModelStudioPlans(stdin, lastFrame);
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Token Plan');
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Alibaba ModelStudio › Region',
      );
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Alibaba ModelStudio › API Key',
      );

      await typeText(stdin, 'sk-token-plan');

      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Alibaba ModelStudio › Model IDs',
      );
      await waitForText(lastFrame, 'Enter model IDs directly');

      // The Model IDs input is pre-filled with the saved custom model id
      // (which only exists in settings, never among the built-in defaults).
      expect(lastFrame()).toContain('my-custom-token-model');

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'should return from Token Plan API key input to Token Plan selection',
    async () => {
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        {
          settings: {},
          originalSettings: {},
          path: '',
        },
        {
          settings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          originalSettings: {
            security: { auth: { selectedType: undefined } },
            ui: { customThemes: {} },
            mcpServers: {},
          },
          path: '',
        },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(settings);

      await openModelStudioPlans(stdin, lastFrame);
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Token Plan');
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Alibaba ModelStudio › Region',
      );
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Alibaba ModelStudio › API Key',
      );
      stdin.write('\u001b');

      await vi.waitFor(
        () => {
          expect(lastFrame()).toContain('Alibaba ModelStudio › Region');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );
      stdin.write('\u001b');

      await vi.waitFor(
        () => {
          expect(lastFrame()).toContain('API key › Alibaba Cloud');
          expectSelectedOption(lastFrame(), 'Token Plan');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  const plainSettings = () => {
    const scope = { ui: { customThemes: {} }, mcpServers: {} };
    return new LoadedSettings(
      { settings: scope, originalSettings: scope, path: '' },
      { settings: {}, originalSettings: {}, path: '' },
      { settings: scope, originalSettings: scope, path: '' },
      { settings: scope, originalSettings: scope, path: '' },
      true,
      new Set(),
    );
  };

  itWhenTuiInputReliable(
    'says a coming-soon OrganizaOne entry is not available yet',
    async () => {
      const handleProviderSubmit = vi.fn();
      const { stdin, lastFrame, unmount } = renderAuthDialog(
        plainSettings(),
        {},
        { handleProviderSubmit },
      );
      await waitForSelectedOption(lastFrame, 'OrganizaOne');
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Connect a provider › OrganizaOne',
      );
      await waitForSelectedOption(lastFrame, 'API key');
      await moveDownAndWaitForSelection(
        stdin,
        lastFrame,
        'Sign in with your account',
      );
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Coming soon: this path depends on the OrganizaOne server.',
      );
      expect(lastFrame()).toContain('Connect a provider › OrganizaOne');
      expect(handleProviderSubmit).not.toHaveBeenCalled();
      unmount();
    },
  );

  itWhenTuiInputReliable(
    'says nothing answered on a local port and probes again on ctrl+r',
    async () => {
      probeLocalServersMock.mockResolvedValue(NOTHING_RUNNING);
      const { stdin, lastFrame, unmount } = renderAuthDialog(plainSettings());
      await waitForSelectedOption(lastFrame, 'OrganizaOne');
      await moveDownAndWaitForSelection(stdin, lastFrame, 'API key');
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Local');
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Connect a provider › Local',
      );
      await waitForText(lastFrame, 'not running');
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Nothing answered on that port. Start the server and press ctrl+r.',
      );
      expect(probeLocalServersMock).toHaveBeenCalledTimes(1);
      probeLocalServersMock.mockResolvedValue(OLLAMA_RUNNING);
      stdin.write('\u0012');
      await waitForText(lastFrame, 'detected · 3 models');
      expect(probeLocalServersMock).toHaveBeenCalledTimes(2);
      unmount();
    },
  );

  itWhenTuiInputReliable(
    'skips the key for a detected server and checks its models',
    async () => {
      probeLocalServersMock.mockResolvedValue(OLLAMA_RUNNING);
      const { stdin, lastFrame, unmount } = renderAuthDialog(plainSettings());
      await waitForText(lastFrame, 'Ollama detected');
      await moveDownAndWaitForSelection(stdin, lastFrame, 'API key');
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Local');
      await pressEnterAndWaitFor(
        stdin,
        lastFrame,
        'Connect a provider › Local',
      );
      await waitForSelectedOption(lastFrame, 'Ollama');
      await pressEnterAndWaitFor(stdin, lastFrame, 'Ollama › Model IDs');
      const frame = lastFrame() ?? '';
      expect(frame).not.toContain('API Key');
      expect(frame).toContain('3 checked');
      expect(frame).toContain('llama3.2:3b');
      unmount();
    },
  );
});

describe('AuthDialog Custom API Key Wizard', { timeout: 15000 }, () => {
  const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

  const createStandardSettings = (): LoadedSettings =>
    new LoadedSettings(
      {
        settings: { ui: { customThemes: {} }, mcpServers: {} },
        originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
        path: '',
      },
      {
        settings: {},
        originalSettings: {},
        path: '',
      },
      {
        settings: {
          security: { auth: { selectedType: undefined } },
          ui: { customThemes: {} },
          mcpServers: {},
        },
        originalSettings: {
          security: { auth: { selectedType: undefined } },
          ui: { customThemes: {} },
          mcpServers: {},
        },
        path: '',
      },
      {
        settings: { ui: { customThemes: {} }, mcpServers: {} },
        originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
        path: '',
      },
      true,
      new Set(),
    );

  itWhenTuiInputReliable(
    'navigates to protocol selection when Custom API Key is selected',
    async () => {
      const settings = createStandardSettings();

      const mockUIState = createMockUIState();
      const mockUIActions = createMockUIActions();

      const mockConfig = {
        getAuthType: vi.fn(() => undefined),
        getContentGeneratorConfig: vi.fn(() => ({})),
      } as unknown as Config;

      const { stdin, lastFrame, unmount } = renderWithProviders(
        <UIStateContext.Provider value={mockUIState}>
          <UIActionsContext.Provider value={mockUIActions}>
            <AuthDialog />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>,
        { settings, config: mockConfig },
      );

      await navigateToCustomProtocolSelect(stdin, lastFrame);

      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('Custom › Protocol');
          expect(frame).toContain('OpenAI-compatible');
          expect(frame).toContain('Anthropic-compatible');
          expect(frame).toContain('Gemini-compatible');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'navigates to base URL input after selecting a protocol',
    async () => {
      const settings = createStandardSettings();

      const mockUIState = createMockUIState();
      const mockUIActions = createMockUIActions();

      const mockConfig = {
        getAuthType: vi.fn(() => undefined),
        getContentGeneratorConfig: vi.fn(() => ({})),
      } as unknown as Config;

      const { stdin, lastFrame, unmount } = renderWithProviders(
        <UIStateContext.Provider value={mockUIState}>
          <UIActionsContext.Provider value={mockUIActions}>
            <AuthDialog />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>,
        { settings, config: mockConfig },
      );

      await navigateToCustomBaseUrlInput(stdin, lastFrame);

      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('Custom › Base URL');
          expect(frame).toContain('Enter the API endpoint');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'shows the review summary after entering model IDs',
    async () => {
      const settings = createStandardSettings();

      const mockUIState = createMockUIState();
      const mockUIActions = createMockUIActions();

      const mockConfig = {
        getAuthType: vi.fn(() => undefined),
        getContentGeneratorConfig: vi.fn(() => ({})),
      } as unknown as Config;

      const { stdin, lastFrame, unmount } = renderWithProviders(
        <UIStateContext.Provider value={mockUIState}>
          <UIActionsContext.Provider value={mockUIActions}>
            <AuthDialog />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>,
        { settings, config: mockConfig },
      );

      await navigateToCustomAdvancedConfig(
        stdin,
        lastFrame,
        'sk-test-key-12345',
        'qwen/qwen3-coder,gpt-4.1',
      );
      await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › Review');

      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('Custom › Review');
          expect(frame).toContain(
            'The key is saved in ~/.o1-code/credentials/ and the models in settings.json.',
          );
          expect(frame).toContain('qwen/qwen3-coder, gpt-4.1');
          expect(frame).not.toContain('O1CODE_CUSTOM_API_KEY_');
          expect(frame).toContain('Enter to save');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'calls handleProviderSubmit on Enter in review view',
    async () => {
      const settings = createStandardSettings();
      const handleProviderSubmit = vi.fn().mockResolvedValue(undefined);

      const mockUIState = createMockUIState();
      const mockUIActions = createMockUIActions({ handleProviderSubmit });

      const mockConfig = {
        getAuthType: vi.fn(() => undefined),
        getContentGeneratorConfig: vi.fn(() => ({})),
      } as unknown as Config;

      const { stdin, lastFrame, unmount } = renderWithProviders(
        <UIStateContext.Provider value={mockUIState}>
          <UIActionsContext.Provider value={mockUIActions}>
            <AuthDialog />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>,
        { settings, config: mockConfig },
      );

      await navigateToCustomAdvancedConfig(
        stdin,
        lastFrame,
        'sk-test',
        'model-1,model-2',
      );
      await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › Review');

      await vi.waitFor(
        () => {
          const frame = lastFrame();
          expect(frame).toContain('Enter to save');
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      stdin.write('\r'); // Enter to save

      await vi.waitFor(
        () => {
          expect(handleProviderSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'custom-openai-compatible' }),
            expect.objectContaining({
              protocol: AuthType.USE_OPENAI,
              apiKey: 'sk-test',
              modelIds: ['model-1', 'model-2'],
            }),
          );
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'shows advanced config screen after entering model IDs',
    async () => {
      const settings = createStandardSettings();

      const mockUIState = createMockUIState();
      const mockUIActions = createMockUIActions();

      const mockConfig = {
        getAuthType: vi.fn(() => undefined),
        getContentGeneratorConfig: vi.fn(() => ({})),
      } as unknown as Config;

      const { stdin, lastFrame, unmount } = renderWithProviders(
        <UIStateContext.Provider value={mockUIState}>
          <UIActionsContext.Provider value={mockUIActions}>
            <AuthDialog />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>,
        { settings, config: mockConfig },
      );

      await navigateToCustomAdvancedConfig(
        stdin,
        lastFrame,
        'sk-test',
        'model-1,model-2',
      );

      await vi.waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('Custom › Advanced Config');
        expect(frame).toContain(
          'Optional: configure advanced generation settings',
        );
        expect(frame).toContain('Enable thinking');
        expect(frame).toContain('Enable modality');
        expect(frame).toContain('Enter to continue');
      });

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'passes generationConfig when advanced options are toggled',
    async () => {
      const settings = createStandardSettings();
      const handleProviderSubmit = vi.fn().mockResolvedValue(undefined);

      const mockUIState = createMockUIState();
      const mockUIActions = createMockUIActions({ handleProviderSubmit });

      const mockConfig = {
        getAuthType: vi.fn(() => undefined),
        getContentGeneratorConfig: vi.fn(() => ({})),
      } as unknown as Config;

      const { stdin, lastFrame, unmount } = renderWithProviders(
        <UIStateContext.Provider value={mockUIState}>
          <UIActionsContext.Provider value={mockUIActions}>
            <AuthDialog />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>,
        { settings, config: mockConfig },
      );

      await navigateToCustomAdvancedConfig(
        stdin,
        lastFrame,
        'sk-test',
        'model-1',
      );

      await vi.waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('Custom › Advanced Config');
      });

      // Toggle thinking (press Space — thinking is initially focused)
      stdin.write(' ');
      await wait();

      // Navigate down to modality, toggle (press ↓ then Space)
      stdin.write('\u001b[B');
      await wait();
      stdin.write(' ');
      await wait();

      // Press Enter to continue to review
      stdin.write('\r');
      await wait();

      // The review is the summary; the options reach the submission below.
      await waitForText(lastFrame, 'Custom › Review');

      // Press Enter to save
      stdin.write('\r');
      await wait();

      await vi.waitFor(() => {
        expect(handleProviderSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'custom-openai-compatible' }),
          expect.objectContaining({
            protocol: AuthType.USE_OPENAI,
            advancedConfig: {
              enableThinking: true,
              multimodal: {
                image: true,
                video: true,
              },
            },
          }),
        );
      });

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'submits thinking for the OpenAI Responses protocol from the review',
    async () => {
      // The review no longer shows the settings JSON; the persisted shape
      // (enable_thinking normalized to `generationConfig.reasoning.effort`)
      // is covered by the flow's preview tests. Here the review submits it.
      const handleProviderSubmit = vi.fn().mockResolvedValue(undefined);
      const settings = createStandardSettings();

      const mockUIState = createMockUIState();
      const mockUIActions = createMockUIActions({ handleProviderSubmit });

      const mockConfig = {
        getAuthType: vi.fn(() => undefined),
        getContentGeneratorConfig: vi.fn(() => ({})),
      } as unknown as Config;

      const { stdin, lastFrame, unmount } = renderWithProviders(
        <UIStateContext.Provider value={mockUIState}>
          <UIActionsContext.Provider value={mockUIActions}>
            <AuthDialog />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>,
        { settings, config: mockConfig },
      );

      await navigateToCustomProtocolSelect(stdin, lastFrame);
      await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › API');
      await moveDownAndWaitForSelection(stdin, lastFrame, 'Responses');
      await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › Base URL');
      // Submit the placeholder default endpoint for this protocol.
      await wait();
      await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › API Key');
      await typeText(stdin, 'sk-test');
      await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › Model IDs');
      await typeText(stdin, 'model-1');
      await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › Advanced Config');

      // Toggle thinking (initially focused), then continue to review.
      stdin.write(' ');
      await wait();
      stdin.write('\r');
      await wait();

      await waitForText(lastFrame, 'Custom › Review');
      expect(lastFrame()).not.toContain('"generationConfig"');
      stdin.write('\r');
      await vi.waitFor(
        () => {
          expect(handleProviderSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'custom-openai-compatible' }),
            expect.objectContaining({
              wireApi: 'responses',
              advancedConfig: expect.objectContaining({
                enableThinking: true,
              }),
            }),
          );
        },
        { timeout: WAIT_FOR_TIMEOUT },
      );

      unmount();
    },
  );

  itWhenTuiInputReliable(
    'reopens a saved Responses install with the API step on Responses',
    async () => {
      // The Custom entry prefills the ids of the saved install, so
      // the API step has to open on the same wire — otherwise Save restamps
      // those ids onto Chat Completions and leaves a duplicate route behind.
      const savedSettings = {
        security: { auth: { selectedType: undefined } },
        ui: { customThemes: {} },
        mcpServers: {},
        modelProviders: {
          openai: [
            {
              id: 'm1',
              baseUrl: 'https://gw.example/v1',
              envKey: 'O1CODE_CUSTOM_API_KEY_X',
              wireApi: 'responses',
            },
          ],
        },
      } as unknown as Settings;
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        { settings: {}, originalSettings: {}, path: '' },
        { settings: savedSettings, originalSettings: savedSettings, path: '' },
        {
          settings: { ui: { customThemes: {} }, mcpServers: {} },
          originalSettings: { ui: { customThemes: {} }, mcpServers: {} },
          path: '',
        },
        true,
        new Set(),
      );

      const { stdin, lastFrame, unmount } = renderAuthDialog(settings);

      await navigateToCustomProtocolSelect(stdin, lastFrame);
      await pressEnterAndWaitFor(stdin, lastFrame, 'Custom › API');
      await waitForSelectedOption(lastFrame, 'Responses');

      unmount();
    },
  );
});
