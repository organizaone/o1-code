/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import stripAnsi from 'strip-ansi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHeader, AppTips } from './AppHeader.js';
import { getFixedHeaderHeight } from './Header.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { LOGO_FRAME_MS } from '../utils/logo-animation.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { type UIState, UIStateContext } from '../contexts/UIStateContext.js';
import { VimModeProvider } from '../contexts/VimModeContext.js';
import * as useTerminalSize from '../hooks/useTerminalSize.js';
import type { LoadedSettings } from '../../config/settings.js';
import { BRAND } from '../../generated/brand.js';

vi.mock('../hooks/useTerminalSize.js');
const useTerminalSizeMock = vi.mocked(useTerminalSize.useTerminalSize);

vi.mock('../hooks/use-system-memory.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSystemMemory: () => ({
    usedBytes: 6.2 * 1024 ** 3,
    totalBytes: 16 * 1024 ** 3,
  }),
}));
vi.mock('../hooks/useMCPHealth.js', () => ({
  useMCPHealth: () => ({
    totalCount: 1,
    disconnectedCount: 1,
    connectingCount: 0,
    connectedCount: 0,
  }),
}));
vi.mock('./WelcomeScreen.js', () => ({
  WelcomeScreen: () => <Text>WELCOME</Text>,
}));
vi.mock('../hooks/useKeypress.js', () => ({ useKeypress: vi.fn() }));
const useKeypressMock = vi.mocked(useKeypress);

const createSettings = (options?: {
  hideTips?: boolean;
  logoAnimation?: string;
}): LoadedSettings => {
  const ui = {
    hideTips: options?.hideTips ?? true,
    logoAnimation: options?.logoAnimation,
  };
  return {
    merged: { ui },
    system: { settings: {}, originalSettings: {}, path: '' },
    systemDefaults: { settings: {}, originalSettings: {}, path: '' },
    user: {
      settings: { ui },
      originalSettings: { ui },
      path: '/home/u/.o1-code/settings.json',
    },
    workspace: { settings: {}, originalSettings: {}, path: '' },
  } as never;
};

const createMockConfig = (overrides = {}) => ({
  getContentGeneratorConfig: vi.fn(() => ({ authType: undefined })),
  getModel: vi.fn(() => 'gemini-pro'),
  getModelDisplayName: vi.fn(() => 'Gemini Pro'),
  getTargetDir: vi.fn(() => '/projects/o1-code'),
  getSessionId: vi.fn(() => 'session-1'),
  getMcpServers: vi.fn(() => ({})),
  getBlockedMcpServers: vi.fn(() => []),
  getDebugMode: vi.fn(() => false),
  getScreenReader: vi.fn(() => false),
  isInteractive: vi.fn(() => true),
  ...overrides,
});

const createMockUIState = (overrides: Partial<UIState> = {}): UIState =>
  ({
    branchName: 'main',
    nightly: false,
    debugMessage: '',
    currentModel: 'gemini-pro',
    sessionStats: {
      lastPromptTokenCount: 0,
    },
    updateInfo: null,
    history: [],
    useTerminalBuffer: true,
    ...overrides,
  }) as UIState;

const renderWithProviders = (
  uiState: UIState,
  settings = createSettings(),
  config = createMockConfig(),
  node: React.ReactNode = <AppHeader version="1.2.3" />,
  columns = 120,
) => {
  useTerminalSizeMock.mockReturnValue({ columns, rows: 24 });
  return render(
    <ConfigContext.Provider value={config as never}>
      <SettingsContext.Provider value={settings}>
        <VimModeProvider settings={settings}>
          <UIStateContext.Provider value={uiState}>
            {node}
          </UIStateContext.Provider>
        </VimModeProvider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
  );
};

describe('<AppHeader />', () => {
  it('shows the version, the organization from brand.json and the directory', () => {
    const { lastFrame } = renderWithProviders(createMockUIState());
    expect(lastFrame()).toContain(
      `v1.2.3 · ${BRAND.organization.toUpperCase()}`,
    );
    expect(lastFrame()).toContain('o1-code');
  });

  it('shows the pending update and the MCP servers offline', () => {
    const { lastFrame } = renderWithProviders(
      createMockUIState({
        updateInfo: {
          message: 'x',
          update: {
            latest: '0.1.1',
            current: '1.2.3',
            type: 'minor',
            name: 'o1-code',
          },
        },
      }),
    );
    expect(lastFrame()).toContain('v0.1.1 available');
    expect(lastFrame()).toContain('1 MCP offline');
  });

  it('survives an update notice without version details', () => {
    const { lastFrame } = renderWithProviders(
      createMockUIState({ updateInfo: { message: 'x' } as never }),
    );
    expect(lastFrame()).toContain('v1.2.3');
    expect(lastFrame()).not.toContain('available');
  });

  it('renders nothing for a screen reader', () => {
    const { lastFrame } = renderWithProviders(
      createMockUIState(),
      createSettings(),
      createMockConfig({ getScreenReader: vi.fn(() => true) }),
    );
    expect(lastFrame()).toBe('');
  });
});

describe('<AppHeader pinned /> logo animation', () => {
  const lines = (frame: string | undefined) =>
    stripAnsi(frame ?? '').split('\n');
  const pinned = <AppHeader version="1.2.3" pinned />;
  const renderPinned = (
    options: {
      setting?: string;
      uiState?: Partial<UIState>;
      config?: object;
      columns?: number;
    } = {},
  ) =>
    renderWithProviders(
      createMockUIState(options.uiState),
      createSettings({ logoAnimation: options.setting ?? 'onda' }),
      createMockConfig(options.config),
      pinned,
      options.columns ?? 120,
    );
  // onda lifts the O into the blank row on its first frame.
  const animating = (frame: string | undefined) =>
    lines(frame)[0]!.trim() !== '';

  beforeEach(() => {
    vi.useFakeTimers();
    useKeypressMock.mockClear();
    // The logo style follows the terminal; pin one that draws block elements.
    vi.stubEnv('TERM_PROGRAM', 'ghostty');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('draws the still wordmark in Terminal.app, whose block elements show seams', () => {
    vi.stubEnv('TERM_PROGRAM', 'Apple_Terminal');
    const { lastFrame } = renderPinned();
    expect(animating(lastFrame())).toBe(false);
    expect(lines(lastFrame())[1]).toContain('O1-CODE.');
    expect(lastFrame()).not.toMatch(/[█▀▄]/);
    expect(lines(lastFrame())).toHaveLength(getFixedHeaderHeight(120));
  });

  it('animates in the blank row and keeps the pinned height during and after', () => {
    const { lastFrame } = renderPinned();
    expect(animating(lastFrame())).toBe(true);
    expect(lines(lastFrame())).toHaveLength(getFixedHeaderHeight(120));
    act(() => {
      vi.advanceTimersByTime(LOGO_FRAME_MS * 40);
    });
    expect(animating(lastFrame())).toBe(false);
    expect(lines(lastFrame())).toHaveLength(getFixedHeaderHeight(120));
    expect(lines(lastFrame())[1]).toContain('█▀█ ▀█');
  });

  it('stops at the first keypress and never starts again', () => {
    const { lastFrame } = renderPinned();
    const [handler] = useKeypressMock.mock.calls.find(
      ([, options]) => options.isActive,
    )!;
    act(() => {
      handler({ name: 'a', sequence: 'a' } as never);
    });
    expect(animating(lastFrame())).toBe(false);
    expect(lines(lastFrame())).toHaveLength(getFixedHeaderHeight(120));
    act(() => {
      vi.advanceTimersByTime(LOGO_FRAME_MS * 5);
    });
    expect(animating(lastFrame())).toBe(false);
    expect(useKeypressMock.mock.lastCall![1].isActive).toBe(false);
  });

  it('does not animate when the setting is off', () => {
    const { lastFrame } = renderPinned({ setting: 'off' });
    expect(animating(lastFrame())).toBe(false);
    expect(lines(lastFrame())).toHaveLength(getFixedHeaderHeight(120));
  });

  it('does not animate once the conversation has started', () => {
    const { lastFrame } = renderPinned({
      uiState: { history: [{ id: 1, type: 'user', text: 'hi' }] as never },
    });
    expect(animating(lastFrame())).toBe(false);
  });

  it('does not animate under 80 columns, where the wordmark shows', () => {
    const { lastFrame } = renderPinned({ columns: 70 });
    expect(animating(lastFrame())).toBe(false);
    expect(lines(lastFrame())).toHaveLength(getFixedHeaderHeight(70));
  });

  it('does not animate outside the full-screen layout or without a terminal user', () => {
    expect(
      animating(
        renderPinned({ uiState: { useTerminalBuffer: false } }).lastFrame(),
      ),
    ).toBe(false);
    expect(
      animating(
        renderPinned({
          config: { isInteractive: vi.fn(() => false) },
        }).lastFrame(),
      ),
    ).toBe(false);
  });

  it('keeps the two pinned blank rows for a screen reader', () => {
    const { lastFrame } = renderPinned({
      config: { getScreenReader: vi.fn(() => true) },
    });
    expect(lines(lastFrame())).toHaveLength(2);
  });
});

describe('<AppTips />', () => {
  it('shows the start screen unless ui.hideTips is set', () => {
    const shown = renderWithProviders(
      createMockUIState(),
      createSettings({ hideTips: false }),
      createMockConfig(),
      <AppTips />,
    );
    expect(shown.lastFrame()).toContain('WELCOME');
    const hidden = renderWithProviders(
      createMockUIState(),
      createSettings({ hideTips: true }),
      createMockConfig(),
      <AppTips />,
    );
    expect(hidden.lastFrame()).toBe('');
  });
});
