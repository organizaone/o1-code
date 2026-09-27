/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import {
  AuthType,
  customProvider,
  localOpenAiProvider,
  ollamaProvider,
} from '@organizaone/o1-code-core';
import type { ModelSpec } from '@organizaone/o1-code-core';
import type { KeypressHandler, Key } from '../contexts/KeypressContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { ProviderSetupSteps } from './ProviderSetupSteps.js';
import { setLanguageAsync } from '../../i18n/index.js';
import {
  useProviderSetupFlow,
  type ProviderSetupFlow,
} from './useProviderSetupFlow.js';

type UseKeypressMockOptions = { isActive: boolean };

const discoverProviderModelsMock = vi.hoisted(() => vi.fn());
const checkProviderKeyMock = vi.hoisted(() => vi.fn());

vi.mock('@organizaone/o1-code-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@organizaone/o1-code-core')>()),
  discoverProviderModels: discoverProviderModelsMock,
  checkProviderKey: checkProviderKeyMock,
}));
vi.mock('../hooks/useKeypress.js');

let activeKeypressHandlers: KeypressHandler[] = [];

describe('ProviderSetupSteps', () => {
  beforeEach(() => {
    activeKeypressHandlers = [];
    discoverProviderModelsMock.mockReset();
    checkProviderKeyMock.mockReset();
    // Tests written against the model list read it through the key check:
    // a served list means an accepted key, no list means it could not be told.
    checkProviderKeyMock.mockImplementation(
      async ({ protocol: _protocol, ...options }: { protocol: string }) => {
        const models = await discoverProviderModelsMock(options);
        return models ? { status: 'ok', models } : { status: 'unavailable' };
      },
    );
    vi.mocked(useKeypress).mockImplementation(
      (handler: KeypressHandler, options?: UseKeypressMockOptions) => {
        if (options?.isActive) {
          activeKeypressHandlers.push(handler);
        }
      },
    );
  });

  const pressKey = (
    name: string,
    sequence: string = name,
    overrides: Partial<Key> = {},
  ) => {
    if (activeKeypressHandlers.length === 0) {
      throw new Error(`No active keypress handler for ${name}`);
    }
    const event = {
      name,
      sequence,
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      ...overrides,
    };
    for (const handler of activeKeypressHandlers) {
      handler(event);
    }
  };

  const pressLatestKey = (
    name: string,
    sequence: string = name,
    overrides: Partial<Key> = {},
  ) => {
    const handler = activeKeypressHandlers.at(-1);
    if (!handler) {
      throw new Error(`No active keypress handler for ${name}`);
    }
    handler({
      name,
      sequence,
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      ...overrides,
    });
  };

  const createProtocolFlow = (): ProviderSetupFlow => {
    const noop = vi.fn();
    return {
      state: {
        provider: customProvider,
        step: 'protocol',
        stepIndex: 0,
        totalSteps: 1,
        protocol: AuthType.USE_OPENAI,
        baseUrl: '',
        baseUrlPlaceholder: '',
        baseUrlOptionIndex: 0,
        baseUrlError: null,
        apiKey: '',
        apiKeyError: null,
        modelIds: '',
        modelIdsError: null,
        thinkingEnabled: false,
        modalityEnabled: false,
        modalityImage: true,
        modalityVideo: true,
        modalityAudio: true,
        modalityPdf: false,
        contextWindowSize: '',
        focusedConfigIndex: 0,
        previewJson: '',
      },
      start: noop,
      reset: noop,
      goBack: noop,
      selectProtocol: noop,
      selectBaseUrl: noop,
      highlightBaseUrl: noop,
      submitBaseUrl: noop,
      changeBaseUrl: noop,
      changeApiKey: noop,
      submitApiKey: noop,
      changeModelIds: noop,
      submitModelIds: noop,
      moveAdvancedFocusUp: noop,
      moveAdvancedFocusDown: noop,
      toggleFocusedAdvancedOption: noop,
      changeContextWindowSize: noop,
      submitAdvancedConfig: noop,
      submit: noop,
    } as unknown as ProviderSetupFlow;
  };

  const createAdvancedConfigFlow = (): ProviderSetupFlow => {
    const noop = vi.fn();
    return {
      state: {
        provider: {
          name: 'Custom',
          authType: AuthType.USE_OPENAI,
          protocol: AuthType.USE_OPENAI,
          showAdvancedConfig: true,
        },
        step: 'advancedConfig',
        stepIndex: 0,
        totalSteps: 1,
        protocol: AuthType.USE_OPENAI,
        baseUrl: '',
        baseUrlPlaceholder: '',
        baseUrlOptionIndex: 0,
        baseUrlError: null,
        apiKey: '',
        apiKeyError: null,
        modelIds: '',
        modelIdsError: null,
        thinkingEnabled: false,
        modalityEnabled: false,
        modalityImage: true,
        modalityVideo: true,
        modalityAudio: true,
        modalityPdf: false,
        contextWindowSize: '',
        focusedConfigIndex: 0,
        previewJson: '',
      },
      start: noop,
      reset: noop,
      goBack: noop,
      selectProtocol: noop,
      selectBaseUrl: noop,
      highlightBaseUrl: noop,
      submitBaseUrl: noop,
      changeBaseUrl: noop,
      changeApiKey: noop,
      submitApiKey: noop,
      changeModelIds: noop,
      clearModelIdsError: vi.fn(),
      submitModelIds: noop,
      moveAdvancedFocusUp: vi.fn(),
      moveAdvancedFocusDown: vi.fn(),
      toggleFocusedAdvancedOption: noop,
      changeContextWindowSize: noop,
      submitAdvancedConfig: noop,
      submit: noop,
    } as unknown as ProviderSetupFlow;
  };

  const createModelIdsFlow = ({
    modelIds = 'MiniMax-M3, MiniMax-M2.7',
    submitModelIds = vi.fn(),
  }: {
    modelIds?: string;
    submitModelIds?: ReturnType<typeof vi.fn>;
  } = {}): ProviderSetupFlow => {
    const noop = vi.fn();
    return {
      state: {
        provider: {
          id: 'minimax',
          label: 'MiniMax API Key',
          description: 'Quick setup for MiniMax models',
          protocol: AuthType.USE_OPENAI,
          baseUrl: 'https://api.minimax.io/v1',
          envKey: 'MINIMAX_API_KEY',
          models: [
            {
              id: 'MiniMax-M3',
              contextWindowSize: 1000000,
              modalities: { image: true, video: true },
            },
            { id: 'MiniMax-M2.7', contextWindowSize: 204800 },
            { id: 'MiniMax-M2.5', contextWindowSize: 196608 },
          ],
          modelsEditable: true,
          modelNamePrefix: 'MiniMax',
        },
        step: 'models',
        stepIndex: 0,
        totalSteps: 1,
        protocol: AuthType.USE_OPENAI,
        baseUrl: '',
        baseUrlPlaceholder: '',
        baseUrlOptionIndex: 0,
        baseUrlError: null,
        apiKey: '',
        apiKeyError: null,
        modelIds,
        modelIdsError: null,
        thinkingEnabled: false,
        modalityEnabled: false,
        modalityImage: true,
        modalityVideo: true,
        modalityAudio: true,
        modalityPdf: false,
        contextWindowSize: '',
        focusedConfigIndex: 0,
        previewJson: '',
      },
      start: noop,
      reset: noop,
      goBack: noop,
      selectProtocol: noop,
      selectBaseUrl: noop,
      highlightBaseUrl: noop,
      submitBaseUrl: noop,
      changeBaseUrl: noop,
      changeApiKey: noop,
      submitApiKey: noop,
      rejectApiKey: vi.fn(),
      setKeyCheck: vi.fn(),
      changeModelIds: noop,
      clearModelIdsError: vi.fn(),
      submitModelIds,
      moveAdvancedFocusUp: noop,
      moveAdvancedFocusDown: noop,
      toggleFocusedAdvancedOption: noop,
      changeContextWindowSize: noop,
      submitAdvancedConfig: noop,
      submit: noop,
    } as unknown as ProviderSetupFlow;
  };

  const createCustomModelIdsFlow = ({
    modelIds = 'model-a, model-b',
    submitModelIds = vi.fn(),
  }: {
    modelIds?: string;
    submitModelIds?: ReturnType<typeof vi.fn>;
  } = {}): ProviderSetupFlow => {
    const noop = vi.fn();
    return {
      state: {
        provider: {
          id: 'custom-openai-compatible',
          label: 'Custom',
          description: 'Manually connect a provider',
          protocol: AuthType.USE_OPENAI,
          modelsEditable: true,
          showAdvancedConfig: true,
        },
        step: 'models',
        stepIndex: 0,
        totalSteps: 1,
        protocol: AuthType.USE_OPENAI,
        baseUrl: '',
        baseUrlPlaceholder: '',
        baseUrlOptionIndex: 0,
        baseUrlError: null,
        apiKey: '',
        apiKeyError: null,
        modelIds,
        modelIdsError: null,
        thinkingEnabled: false,
        modalityEnabled: false,
        modalityImage: true,
        modalityVideo: true,
        modalityAudio: false,
        modalityPdf: false,
        contextWindowSize: '',
        focusedConfigIndex: 0,
        previewJson: '',
      },
      start: noop,
      reset: noop,
      goBack: noop,
      selectProtocol: noop,
      selectBaseUrl: noop,
      highlightBaseUrl: noop,
      submitBaseUrl: noop,
      changeBaseUrl: noop,
      changeApiKey: noop,
      submitApiKey: noop,
      changeModelIds: noop,
      clearModelIdsError: vi.fn(),
      submitModelIds,
      moveAdvancedFocusUp: noop,
      moveAdvancedFocusDown: noop,
      toggleFocusedAdvancedOption: noop,
      changeContextWindowSize: noop,
      submitAdvancedConfig: noop,
      submit: noop,
    } as unknown as ProviderSetupFlow;
  };

  const enableDiscovery = (flow: ProviderSetupFlow) => {
    if (!flow.state.provider) {
      throw new Error('Expected a provider');
    }
    flow.state.provider = {
      ...flow.state.provider,
      supportsModelDiscovery: true,
    };
    flow.state.baseUrl = 'https://example.com/v1';
    flow.state.apiKey = 'secret-key';
  };

  it('shows one OpenAI provider choice and a separate API step', () => {
    const flow = createProtocolFlow();

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    expect(lastFrame()).toContain('OpenAI-compatible');
    expect(lastFrame()).not.toContain('OpenAI Responses');
    unmount();
    flow.state.step = 'wireApi';
    flow.state.wireApi = 'responses';
    flow.selectWireApi = vi.fn();
    const apiView = renderWithProviders(<ProviderSetupSteps flow={flow} />);
    expect(apiView.lastFrame()).toContain('Chat Completions');
    expect(apiView.lastFrame()).toContain('Responses');
    apiView.unmount();
  });
  it('sums up the connection before the settings it will save', () => {
    const flow = createProtocolFlow();
    flow.state.step = 'review';
    flow.state.baseUrl = 'https://api.example.test/v1';
    flow.state.apiKey = 'zai-7c1f0123456789ab3f9a';
    flow.state.modelIds = 'glm-5, glm-4';
    flow.state.previewJson = '{}';

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain(customProvider.label);
    expect(frame).toContain('https://api.example.test/v1');
    expect(frame).toContain('zai-7c1f…3f9a');
    expect(frame).not.toContain('0123456789');
    expect(frame).toContain('glm-5, glm-4');
    unmount();
  });

  it('shows a compact summary instead of the settings JSON', () => {
    const flow = createProtocolFlow();
    flow.state.step = 'review';
    flow.state.baseUrl = 'https://api.example.test/v1';
    flow.state.apiKey = 'zai-7c1f0123456789ab3f9a';
    flow.state.modelIds = 'glm-5, glm-4, glm-4-air';
    flow.state.previewJson = '{\n  "modelProviders": {}\n}';

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    const rows = (lastFrame() ?? '')
      .split('\n')
      .map((row) => row.trim())
      .filter(Boolean);
    expect(rows.slice(0, 4).map((row) => row.split(/\s{2,}/)[0])).toEqual([
      'Provider',
      'Endpoint',
      'Key',
      'Models',
    ]);
    expect(rows).toContain(
      'The key is saved in ~/.o1-code/credentials/ and the models in settings.json.',
    );
    expect(lastFrame()).not.toContain('modelProviders');
    expect(lastFrame()).not.toContain('The following JSON');
    // Summary, note and hint: it fits a 40-row terminal whatever the plan.
    expect(rows.length).toBeLessThanOrEqual(6);
    unmount();
  });

  it('still shows why the plan was refused on the review', () => {
    const flow = createProtocolFlow();
    flow.state.step = 'review';
    flow.state.modelIds = 'glm-5';
    flow.state.previewError = 'These models hold different credentials.';

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    expect(lastFrame()).toContain('These models hold different credentials.');
    unmount();
  });

  const createKeyStepFlow = () => {
    const flow = createProtocolFlow();
    flow.state.step = 'apiKey';
    flow.state.baseUrl = 'https://api.example.test/v1';
    flow.state.apiKey = 'sk-typed-key';
    flow.submitApiKey = vi.fn(() => true);
    flow.rejectApiKey = vi.fn();
    flow.setKeyCheck = vi.fn();
    return flow;
  };

  it('checks the key with the provider before moving on', async () => {
    checkProviderKeyMock.mockReturnValue(new Promise(() => {}));
    const flow = createKeyStepFlow();
    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    await act(async () => {
      pressLatestKey('return', '\r');
    });

    expect(lastFrame()).toContain('checking the key…');
    expect(flow.submitApiKey).not.toHaveBeenCalled();
    unmount();
  });

  it('stays on the key step with the reason when the provider refuses it', async () => {
    checkProviderKeyMock.mockResolvedValue({
      status: 'rejected',
      httpStatus: 403,
    });
    const flow = createKeyStepFlow();
    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);

    await act(async () => {
      pressLatestKey('return', '\r');
    });

    expect(flow.rejectApiKey).toHaveBeenCalledWith(
      expect.stringContaining('403'),
    );
    expect(flow.submitApiKey).not.toHaveBeenCalled();
    unmount();
  });

  it('moves on with a refused key when enter is pressed again on it', async () => {
    // A key without permission to list models can still work for chat.
    checkProviderKeyMock.mockResolvedValue({
      status: 'rejected',
      httpStatus: 403,
    });
    const flow = createKeyStepFlow();
    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);

    await act(async () => {
      pressLatestKey('return', '\r');
    });
    await act(async () => {
      pressLatestKey('return', '\r');
    });

    expect(checkProviderKeyMock).toHaveBeenCalledTimes(1);
    expect(flow.setKeyCheck).toHaveBeenCalledWith({ status: 'unavailable' });
    expect(flow.submitApiKey).toHaveBeenCalledWith('sk-typed-key');
    unmount();
  });

  it('keeps what the provider said and moves on with an accepted key', async () => {
    const accepted = { status: 'ok', models: [{ id: 'served' }] };
    checkProviderKeyMock.mockResolvedValue(accepted);
    const flow = createKeyStepFlow();
    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);

    await act(async () => {
      pressLatestKey('return', '\r');
    });

    expect(flow.setKeyCheck).toHaveBeenCalledWith(accepted);
    expect(flow.submitApiKey).toHaveBeenCalledWith('sk-typed-key');
    unmount();
  });

  it('checks the key as typed, even when the flow state lags behind', async () => {
    // A paste and enter in one burst reach the input before the flow state.
    checkProviderKeyMock.mockReturnValue(new Promise(() => {}));
    const flow = createKeyStepFlow();
    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);

    await act(async () => {
      pressLatestKey('x', 'x');
      pressLatestKey('return', '\r');
    });

    expect(checkProviderKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'xsk-typed-key' }),
    );
    unmount();
  });

  it('asks the provider once when enter is pressed again during the check', async () => {
    checkProviderKeyMock.mockReturnValue(new Promise(() => {}));
    const flow = createKeyStepFlow();
    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);
    // The handler that saw the first enter: the harness keeps it registered.
    const firstHandler = activeKeypressHandlers.at(-1)!;
    const enter = {
      name: 'return',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
    };

    await act(async () => {
      firstHandler(enter);
    });
    await act(async () => {
      firstHandler(enter);
    });

    expect(checkProviderKeyMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not move on when the step closes during the check', async () => {
    let answer: (value: unknown) => void = () => {};
    checkProviderKeyMock.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const flow = createKeyStepFlow();
    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);

    await act(async () => {
      pressLatestKey('return', '\r');
    });
    unmount();
    await act(async () => {
      answer({ status: 'ok', models: [] });
    });

    expect(flow.submitApiKey).not.toHaveBeenCalled();
    expect(flow.setKeyCheck).not.toHaveBeenCalled();
  });

  it('shows the provider name translated on the review', async () => {
    await setLanguageAsync('pt');
    try {
      const flow = createModelIdsFlow();
      flow.state.provider = {
        ...flow.state.provider!,
        label: 'Other local server',
      };
      flow.state.step = 'review';
      flow.state.previewJson = '{}';
      const { lastFrame, unmount } = renderWithProviders(
        <ProviderSetupSteps flow={flow} />,
      );
      expect(lastFrame()).toContain('Outro servidor local');
      unmount();
    } finally {
      await setLanguageAsync('en');
    }
  });

  it('confirms an accepted key on the review', () => {
    const flow = createProtocolFlow();
    flow.state.step = 'review';
    flow.state.apiKey = 'zai-7c1f0123456789ab3f9a';
    flow.state.previewJson = '{}';
    flow.state.keyCheck = { status: 'ok', models: [] };

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    expect(lastFrame()).toMatch(/zai-7c1f…3f9a\s+✓ key valid/);
    unmount();
  });

  it('masks the API key and says where it is saved', () => {
    const flow = createProtocolFlow();
    flow.state.step = 'apiKey';
    flow.state.apiKey = 'zai-7c1f0123456789ab3f9a';

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    expect(lastFrame()).toContain('zai-7c1f');
    expect(lastFrame()).not.toContain('0123456789');
    expect(lastFrame()).toContain(
      'the key is saved in ~/.o1-code/credentials/, for your user only',
    );
    expect(lastFrame()).not.toContain('user settings');
    unmount();
  });

  it('opens a detected local server on its models, all checked, with no key', async () => {
    const flow = createModelIdsFlow({ modelIds: '' });
    const served = Array.from({ length: 12 }, (_, index) => ({
      id: `local-${index}`,
    }));
    flow.state.provider = {
      ...ollamaProvider,
    };
    flow.state.baseUrl = ollamaProvider.baseUrl as string;
    flow.state.apiKey = 'local';
    flow.state.firstSetup = true;
    // The Local screen hands over what the probe listed.
    flow.state.keyCheck = { status: 'ok', models: served };

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const frame = lastFrame() ?? '';
    expect(checkProviderKeyMock).not.toHaveBeenCalled();
    expect(frame).toContain('12 checked');
    expect(frame).not.toContain('key valid');
    unmount();
  });

  it('asks the endpoint in the user language', async () => {
    await setLanguageAsync('pt');
    try {
      const flow = createProtocolFlow();
      flow.state.step = 'baseUrl';
      const { lastFrame, unmount } = renderWithProviders(
        <ProviderSetupSteps flow={flow} />,
      );
      expect(lastFrame()).toContain(
        'Informe o endpoint da API para este protocolo.',
      );
      unmount();
    } finally {
      await setLanguageAsync('en');
    }
  });

  it('asks a port for another local server', () => {
    const flow = createProtocolFlow();
    flow.state.provider = localOpenAiProvider;
    flow.state.step = 'baseUrl';

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    expect(lastFrame()).toContain(
      'Port of the server on this machine, or its full URL.',
    );
    expect(lastFrame()).toContain('8080');
    expect(lastFrame()).not.toContain('api.openai.com');
    unmount();
  });

  it('maps Ctrl+P/N to advanced-config focus navigation', () => {
    const flow = createAdvancedConfigFlow();

    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);

    pressKey('p', '\u0010', { ctrl: true });
    pressKey('n', '\u000E', { ctrl: true });

    expect(flow.moveAdvancedFocusUp).toHaveBeenCalledTimes(1);
    expect(flow.moveAdvancedFocusDown).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('renders predefined editable models with a primary free-form input and recommendations', () => {
    const flow = createModelIdsFlow();

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Enter model IDs directly');
    expect(frame).toContain('Recommended models');
    expect(frame).not.toContain('Other models from the provider');
    expect(frame).toContain(
      'Checked recommended models are applied on submit but not copied into the input.',
    );
    expect(frame).toContain('●');
    expect(frame).toContain('○');
    expect(frame).not.toContain('›');
    expect(frame).not.toContain('[x]');
    expect(frame).not.toContain('[ ]');
    expect(frame).toContain('MiniMax-M3');
    expect(frame).toContain('1,000,000 tokens');
    expect(frame).toContain('text/image/video');
    expect(frame).toContain('204,800 tokens, text');
    expect(frame).not.toContain('Edit raw / custom model IDs');
    expect(frame).not.toContain('Tab for custom IDs');
    expect(frame).toContain('Search');
    expect(frame).toContain(
      '↑↓/Tab to switch input, search, and recommendations',
    );
    expect(frame).not.toContain('Enter model IDs separated by commas');
    unmount();
  });

  it('filters recommended models when typing search while recommendations are focused', async () => {
    const flow = createModelIdsFlow();

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    await act(async () => {
      pressLatestKey('down');
    });
    await act(async () => {
      pressLatestKey('M', 'M');
    });
    await act(async () => {
      pressLatestKey('3', '3');
    });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('> M3');
    expect(frame).toContain('MiniMax-M3');
    expect(frame).not.toContain('MiniMax-M2.7');
    expect(frame).not.toContain('MiniMax-M2.5');
    unmount();
  });

  it('points at the focused model and marks the checked ones with a dot', async () => {
    const flow = createModelIdsFlow({ modelIds: 'MiniMax-M3' });
    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    await act(async () => {
      pressLatestKey('down');
    });
    await act(async () => {
      pressLatestKey('down');
    });

    const rows = (lastFrame() ?? '').split('\n');
    const focused = rows.filter((row) => row.includes('❯'));
    expect(focused).toHaveLength(1);
    expect(focused[0]).toMatch(/❯ [●○]︎?\s+MiniMax/);
    expect(rows.some((row) => /●︎?\s+MiniMax-M3/.test(row))).toBe(true);
    expect(lastFrame()).not.toContain('◉');
    unmount();
  });

  it('shows the fallback empty state when no recommended model matches', async () => {
    const flow = createModelIdsFlow();
    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    await act(async () => {
      pressLatestKey('down');
    });
    await act(async () => {
      pressLatestKey('z', 'z');
    });

    expect(lastFrame()).toContain('No recommended models match.');
    unmount();
  });

  it('keeps recommended selections out of the free-form model input', () => {
    const flow = createModelIdsFlow({
      modelIds: 'custom-model, MiniMax-M3, MiniMax-M2.7',
    });

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    const frame = lastFrame() ?? '';
    const inputLine = frame
      .split('\n')
      .find((line) => line.includes('custom-model'));
    expect(inputLine).toContain('custom-model');
    expect(inputLine).not.toContain('MiniMax-M3');
    expect(inputLine).not.toContain('MiniMax-M2.7');
    expect(frame).toMatch(/●\uFE0E\s+MiniMax-M3/);
    expect(frame).toMatch(/●\uFE0E\s+MiniMax-M2\.7/);
    unmount();
  });

  it('deduplicates typed and recommended model IDs on submit', () => {
    const submitModelIds = vi.fn();
    const flow = createModelIdsFlow({
      modelIds: 'custom-model, MiniMax-M3, MiniMax-M3, MiniMax-M2.7',
      submitModelIds,
    });

    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);

    pressKey('return', '\r');

    expect(submitModelIds).toHaveBeenCalledWith({
      modelIds: ['MiniMax-M3', 'MiniMax-M2.7', 'custom-model'],
    });
    unmount();
  });

  it('preserves comma-separated model IDs for custom providers', () => {
    const submitModelIds = vi.fn();
    const flow = createCustomModelIdsFlow({
      modelIds: 'model-a, model-b',
      submitModelIds,
    });

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Enter model IDs separated by commas');
    expect(frame).toContain('model-a, model-b');

    pressLatestKey('return', '\r');

    expect(submitModelIds).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('sends the flow back to the key step when the provider refuses the key', async () => {
    checkProviderKeyMock.mockResolvedValue({
      status: 'rejected',
      httpStatus: 401,
    });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);
    flow.rejectApiKey = vi.fn();

    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(flow.rejectApiKey).toHaveBeenCalledWith(
      expect.stringContaining('401'),
    );
    unmount();
  });

  it('confirms the key and checks the served built-in models on a first setup', async () => {
    checkProviderKeyMock.mockResolvedValue({
      status: 'ok',
      models: [{ id: 'MiniMax-M3' }, { id: 'served-extra' }],
    });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('key valid');
    expect(frame).toMatch(/●\uFE0E?\s+MiniMax-M3/);
    expect(frame).toMatch(/○\uFE0E?\s+served-extra/);
    unmount();
  });

  it('leaves out built-in models the provider does not serve', async () => {
    checkProviderKeyMock.mockResolvedValue({
      status: 'ok',
      models: [{ id: 'MiniMax-M3' }, { id: 'served-extra' }],
    });
    // The flow starts with every built-in model filled in.
    const flow = createModelIdsFlow({
      modelIds: 'MiniMax-M3, MiniMax-M2.7, MiniMax-M2.5',
    });
    enableDiscovery(flow);
    flow.state.firstSetup = true;

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/●\uFE0E?\s+MiniMax-M3/);
    expect(frame).not.toContain('MiniMax-M2.7');
    expect(frame).not.toContain('MiniMax-M2.5');
    unmount();
  });

  it('keeps every model on a provider set up before, served or not', async () => {
    checkProviderKeyMock.mockResolvedValue({
      status: 'ok',
      models: [{ id: 'MiniMax-M3' }, { id: 'served-extra' }],
    });
    // Saved before with only the built-in models: the same IDs a first
    // setup starts with, but they are the person's choice.
    const flow = createModelIdsFlow({
      modelIds: 'MiniMax-M3, MiniMax-M2.7, MiniMax-M2.5',
    });
    enableDiscovery(flow);
    flow.state.firstSetup = false;

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('MiniMax-M2.7');
    expect(frame).toMatch(/○\uFE0E?\s+served-extra/);
    unmount();
  });

  it('checks every served model when the provider has no built-in list', async () => {
    checkProviderKeyMock.mockResolvedValue({
      status: 'ok',
      models: [{ id: 'local-a' }, { id: 'local-b' }],
    });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);
    flow.state.provider = { ...flow.state.provider!, models: [] };

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/●\uFE0E?\s+local-a/);
    expect(frame).toMatch(/●\uFE0E?\s+local-b/);
    unmount();
  });

  it('offers to fetch the models again when the provider list could not be read', async () => {
    checkProviderKeyMock.mockResolvedValueOnce({ status: 'unavailable' });
    checkProviderKeyMock.mockResolvedValueOnce({
      status: 'ok',
      models: [{ id: 'late-model' }],
    });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(lastFrame()).toContain('ctrl+r fetches the models again');

    // The app hands a keypress to every active listener.
    await act(async () => {
      for (const handler of [...activeKeypressHandlers]) {
        handler({
          name: 'r',
          sequence: '\u0012',
          ctrl: true,
          meta: false,
          shift: false,
          paste: false,
        });
      }
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(checkProviderKeyMock).toHaveBeenCalledTimes(2);
    expect(lastFrame()).toContain('late-model');
    // The review reads the answer from the flow.
    expect(flow.setKeyCheck).toHaveBeenLastCalledWith({
      status: 'ok',
      models: [{ id: 'late-model' }],
    });
    unmount();
  });

  it('keeps what was typed when fetching the models again', async () => {
    checkProviderKeyMock.mockResolvedValueOnce({ status: 'unavailable' });
    checkProviderKeyMock.mockResolvedValueOnce({
      status: 'ok',
      models: [{ id: 'late-model' }],
    });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    // The model ID field has the focus: type an ID.
    await act(async () => {
      for (const ch of 'my-model') pressLatestKey(ch, ch);
    });
    expect(lastFrame()).toContain('my-model');

    await act(async () => {
      for (const handler of [...activeKeypressHandlers]) {
        handler({
          name: 'r',
          sequence: '\u0012',
          ctrl: true,
          meta: false,
          shift: false,
          paste: false,
        });
      }
    });
    await act(async () => {
      await Promise.resolve();
    });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('late-model');
    expect(frame).toContain('my-model');
    unmount();
  });

  it('says once that the list could not be read, and what ctrl+r costs', async () => {
    checkProviderKeyMock.mockResolvedValue({ status: 'unavailable' });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('provider list unavailable');
    expect(frame).not.toContain('could not be read');
    expect(frame).toContain('ctrl+r fetches the models again');
    expect(frame).not.toContain('restarts the selection');
    unmount();
  });

  it('says why ctrl+r is offered when there is no list to show', async () => {
    checkProviderKeyMock.mockResolvedValue({ status: 'unavailable' });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);
    flow.state.provider = { ...flow.state.provider!, models: [] };

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(lastFrame()).toContain(
      'The provider list could not be read · ctrl+r fetches the models again',
    );
    unmount();
  });

  it('offers ctrl+r for a Gemini-protocol provider, which lists its models', async () => {
    checkProviderKeyMock.mockResolvedValue({ status: 'unavailable' });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);
    flow.state.protocol = AuthType.USE_GEMINI;

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(lastFrame()).toContain('ctrl+r fetches the models again');
    unmount();
  });

  it('keeps an earlier answer about the key when fetching again fails', async () => {
    // The key step found the key accepted with an empty list; asking again
    // then fails on the network.
    checkProviderKeyMock.mockResolvedValueOnce({ status: 'unavailable' });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);
    flow.state.keyCheck = { status: 'ok', models: [] };

    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      for (const handler of [...activeKeypressHandlers]) {
        handler({
          name: 'r',
          sequence: '',
          ctrl: true,
          meta: false,
          shift: false,
          paste: false,
        });
      }
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(checkProviderKeyMock).toHaveBeenCalledTimes(1);
    expect(flow.setKeyCheck).not.toHaveBeenCalledWith({
      status: 'unavailable',
    });
    unmount();
  });

  it('stays on the models step when fetching again is refused', async () => {
    // The key may have been kept on purpose after a refusal on the key step.
    checkProviderKeyMock.mockResolvedValueOnce({ status: 'unavailable' });
    checkProviderKeyMock.mockResolvedValueOnce({
      status: 'rejected',
      httpStatus: 403,
    });
    const flow = createModelIdsFlow({ modelIds: '' });
    enableDiscovery(flow);
    flow.rejectApiKey = vi.fn();

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      for (const handler of [...activeKeypressHandlers]) {
        handler({
          name: 'r',
          sequence: '\u0012',
          ctrl: true,
          meta: false,
          shift: false,
          paste: false,
        });
      }
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(checkProviderKeyMock).toHaveBeenCalledTimes(2);
    expect(flow.rejectApiKey).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('ctrl+r fetches the models again');
    unmount();
  });

  it('does not mount the model editor before discovery settles', () => {
    discoverProviderModelsMock.mockReturnValue(new Promise(() => {}));
    const flow = createModelIdsFlow();
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('checking the key…');
    expect(frame).toContain('Esc to go back');
    expect(frame).not.toContain('Enter model IDs directly');
    expect(discoverProviderModelsMock).toHaveBeenCalledWith({
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret-key',
      staticModels: flow.state.provider?.models,
      signal: expect.any(AbortSignal),
    });
    unmount();
  });

  it('mounts one provider snapshot without promoting new models or dropping unserved selections', async () => {
    let resolveDiscovery!: (models: ModelSpec[]) => void;
    discoverProviderModelsMock.mockReturnValue(
      new Promise<ModelSpec[]>((resolve) => {
        resolveDiscovery = resolve;
      }),
    );
    const submitModelIds = vi.fn();
    const flow = createModelIdsFlow({
      modelIds: 'custom-model, MiniMax-M3, MiniMax-M2.7',
      submitModelIds,
    });
    enableDiscovery(flow);
    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    await act(async () => {
      resolveDiscovery([
        {
          id: 'MiniMax-M3',
          contextWindowSize: 1000000,
          modalities: { image: true, video: true },
        },
        { id: 'MiniMax-M4' },
        { id: 'custom-model' },
      ]);
    });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Models · from the provider');
    expect(frame).not.toContain('Other models from the provider');
    expect(frame).toContain('custom-model');
    expect(frame).toContain('MiniMax-M3');
    expect(frame).toContain('MiniMax-M4');
    // The snapshot has no row for the previously selected MiniMax-M2.7, so it
    // stays visible and selectable through the free-form input instead.
    expect(frame).not.toMatch(/[●○]\uFE0E\s+MiniMax-M2\.7/);
    const inputLine = frame
      .split('\n')
      .find((line) => line.includes('custom-model'));
    expect(inputLine).toContain('custom-model, MiniMax-M2.7');
    expect(frame).toMatch(/●\uFE0E\s+MiniMax-M3/);
    expect(frame).toMatch(/○\uFE0E\s+MiniMax-M4/);
    expect(frame).toMatch(/○\uFE0E\s+custom-model/);
    const modelRows = frame.split('\n');
    expect(
      modelRows.findIndex((line) => /●\uFE0E\s+MiniMax-M3/.test(line)),
    ).toBeLessThan(
      modelRows.findIndex((line) => /○\uFE0E\s+MiniMax-M4/.test(line)),
    );
    expect(
      modelRows.findIndex((line) => /○\uFE0E\s+MiniMax-M4/.test(line)),
    ).toBeLessThan(
      modelRows.findIndex((line) => /○\uFE0E\s+custom-model/.test(line)),
    );
    expect(frame).toContain(
      'Checked models are applied on submit but not copied into the input.',
    );
    expect(frame).toContain(
      '↑↓/Tab to switch input, search, and models, Space to toggle models',
    );
    await act(async () => {
      pressLatestKey('x', 'x');
    });
    expect(lastFrame()).toContain('xcustom-model, MiniMax-M2.7');
    expect(flow.changeModelIds).not.toHaveBeenCalled();
    pressKey('return', '\r');
    expect(submitModelIds).toHaveBeenCalledWith({
      modelIds: ['MiniMax-M3', 'xcustom-model', 'MiniMax-M2.7'],
    });
    unmount();
  });

  it('lists provider-only models in the unified provider catalog', async () => {
    discoverProviderModelsMock.mockResolvedValue([
      { id: 'served-unknown-a' },
      { id: 'served-unknown-b' },
    ]);
    const flow = createModelIdsFlow();
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {});

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Models · from the provider');
    expect(frame).not.toContain('Other models from the provider');
    expect(frame).toMatch(/○\uFE0E\s+served-unknown-a/);
    expect(frame).toMatch(/○\uFE0E\s+served-unknown-b/);
    unmount();
  });

  it('shows selected models in curated order while rendering provider order', async () => {
    discoverProviderModelsMock.mockResolvedValue([
      { id: 'MiniMax-M2.7', contextWindowSize: 204800 },
      {
        id: 'MiniMax-M3',
        contextWindowSize: 1000000,
        modalities: { image: true, video: true },
      },
    ]);
    const submitModelIds = vi.fn();
    const flow = createModelIdsFlow({ submitModelIds });
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {});

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Models · from the provider · 2 checked');
    expect(frame).toMatch(/●\uFE0E\s+MiniMax-M2\.7/);
    expect(frame).toMatch(/●\uFE0E\s+MiniMax-M3/);
    expect(frame.indexOf('MiniMax-M2.7')).toBeLessThan(
      frame.indexOf('MiniMax-M3'),
    );

    pressKey('return', '\r');
    expect(submitModelIds).toHaveBeenCalledWith({
      modelIds: ['MiniMax-M3', 'MiniMax-M2.7'],
    });
    unmount();
  });

  it('keeps curated selection order after toggling a provider-only model', async () => {
    discoverProviderModelsMock.mockResolvedValue([
      { id: 'provider-only-new' },
      { id: 'MiniMax-M2.7' },
      { id: 'MiniMax-M3' },
    ]);
    const submitModelIds = vi.fn();
    const flow = createModelIdsFlow({ submitModelIds });
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {});

    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/○\uFE0E\s+provider-only-new/);
    expect(frame).toMatch(/●\uFE0E\s+MiniMax-M2\.7/);
    expect(frame.indexOf('provider-only-new')).toBeLessThan(
      frame.indexOf('MiniMax-M2.7'),
    );

    await act(async () => {
      pressLatestKey('down');
    });
    await act(async () => {
      pressLatestKey('down');
    });
    await act(async () => {
      pressLatestKey('space', ' ');
    });

    pressKey('return', '\r');
    expect(submitModelIds).toHaveBeenCalledWith({
      modelIds: ['MiniMax-M3', 'MiniMax-M2.7', 'provider-only-new'],
    });
    unmount();
  });

  it('reports selected models that begin below the provider window', async () => {
    discoverProviderModelsMock.mockResolvedValue([
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `new-model-${index}`,
      })),
      { id: 'MiniMax-M3' },
      { id: 'MiniMax-M2.7' },
    ]);
    const flow = createModelIdsFlow();
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {});

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Models · from the provider · 2 checked');
    expect(frame).not.toContain('MiniMax-M3');
    expect(frame).not.toContain('MiniMax-M2.7');
    unmount();
  });

  it('shows the provider empty state when no discovered model matches', async () => {
    discoverProviderModelsMock.mockResolvedValue([{ id: 'served-model' }]);
    const flow = createModelIdsFlow();
    enableDiscovery(flow);
    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {});

    await act(async () => {
      pressLatestKey('down');
    });
    await act(async () => {
      pressLatestKey('z', 'z');
    });

    expect(lastFrame()).toContain('No models match.');
    unmount();
  });

  it('toggles and submits an unendorsed provider model like a recommended one', async () => {
    let resolveDiscovery!: (models: ModelSpec[]) => void;
    discoverProviderModelsMock.mockReturnValue(
      new Promise<ModelSpec[]>((resolve) => {
        resolveDiscovery = resolve;
      }),
    );
    const submitModelIds = vi.fn();
    const flow = createModelIdsFlow({
      modelIds: 'custom-model, MiniMax-M3',
      submitModelIds,
    });
    enableDiscovery(flow);
    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    await act(async () => {
      resolveDiscovery([
        { id: 'MiniMax-M3', contextWindowSize: 1000000 },
        { id: 'MiniMax-M4' },
      ]);
    });

    await act(async () => {
      pressLatestKey('down');
    });
    await act(async () => {
      pressLatestKey('down');
    });
    await act(async () => {
      pressLatestKey('down');
    });
    await act(async () => {
      pressLatestKey('space', ' ');
    });

    expect(lastFrame()).toMatch(/●\uFE0E\s+MiniMax-M4/);
    expect(lastFrame()).toContain('Models · from the provider · 2 checked');

    pressKey('return', '\r');
    expect(submitModelIds).toHaveBeenCalledWith({
      modelIds: ['MiniMax-M3', 'MiniMax-M4', 'custom-model'],
    });
    unmount();
  });

  it('falls back to built-ins after an unavailable catalog', async () => {
    discoverProviderModelsMock.mockResolvedValue(null);
    const flow = createModelIdsFlow();
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );
    await act(async () => {});

    const frame = lastFrame() ?? '';
    expect(frame).toContain(
      'Recommended models · provider list unavailable, showing built-ins',
    );
    expect(frame).not.toContain('Other models from the provider');
    expect(frame).toContain('MiniMax-M2.7');
    unmount();
  });

  it('cancels a pending discovery when the step unmounts', () => {
    discoverProviderModelsMock.mockReturnValue(new Promise(() => {}));
    const flow = createModelIdsFlow();
    enableDiscovery(flow);
    const { unmount } = renderWithProviders(<ProviderSetupSteps flow={flow} />);
    const signal = discoverProviderModelsMock.mock.calls[0]?.[0]
      .signal as AbortSignal;

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it('submits served recommendations ahead of unserved defaults on a partial catalog', async () => {
    let resolveDiscovery!: (models: ModelSpec[]) => void;
    discoverProviderModelsMock.mockReturnValue(
      new Promise<ModelSpec[]>((resolve) => {
        resolveDiscovery = resolve;
      }),
    );
    const submitModelIds = vi.fn();
    // Defaults are pre-selected; the catalog serves MiniMax-M3 but not the
    // built-in MiniMax-M2.7, which the step demotes into the free-form input.
    const flow = createModelIdsFlow({ submitModelIds });
    enableDiscovery(flow);

    const { lastFrame, unmount } = renderWithProviders(
      <ProviderSetupSteps flow={flow} />,
    );

    await act(async () => {
      resolveDiscovery([{ id: 'MiniMax-M3', contextWindowSize: 1000000 }]);
    });

    expect(lastFrame()).toContain('Enter model IDs directly');

    pressKey('return', '\r');

    // The no-edit submit must lead with a catalog-served model: models[0]
    // becomes modelSelection and is written as model.name on first-time setup.
    expect(submitModelIds).toHaveBeenCalledWith({
      modelIds: ['MiniMax-M3', 'MiniMax-M2.7'],
    });
    unmount();
  });

  it('clears the model-ids error on edit after an empty discovery submit', async () => {
    // More models than a first setup checks on its own, so the submit is empty.
    discoverProviderModelsMock.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ id: `served-model-${i}` })),
    );

    let flow: ProviderSetupFlow | undefined;
    const RealFlowHarness = () => {
      const realFlow = useProviderSetupFlow(async () => {});
      flow = realFlow;
      return <ProviderSetupSteps flow={realFlow} />;
    };

    const { lastFrame, unmount } = renderWithProviders(<RealFlowHarness />);

    await act(async () => {
      flow?.start({
        id: 'discovery-provider',
        label: 'Discovery Provider',
        description: 'Provider with model discovery',
        protocol: AuthType.USE_OPENAI,
        baseUrl: 'https://example.com/v1',
        envKey: 'DISCOVERY_API_KEY',
        modelsEditable: true,
        supportsModelDiscovery: true,
        modelNamePrefix: 'Discovery',
      });
    });
    await act(async () => {
      flow?.submitApiKey('sk-discovery');
    });
    await act(async () => {});

    expect(lastFrame()).toContain('Enter model IDs directly');

    await act(async () => {
      pressLatestKey('return', '\r');
    });
    expect(lastFrame()).toContain('Model IDs cannot be empty.');

    await act(async () => {
      pressLatestKey('x', 'x');
    });
    expect(lastFrame()).not.toContain('Model IDs cannot be empty.');

    unmount();
  });
});
