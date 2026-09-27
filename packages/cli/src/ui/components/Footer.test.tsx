/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { render as inkRender } from 'ink';
import type { DOMElement } from 'ink';
import stripAnsi from 'strip-ansi';
import { EventEmitter } from 'node:events';
import { createRef, type RefObject } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Footer } from './Footer.js';
import {
  ApprovalMode,
  type BackgroundApproval,
} from '@organizaone/o1-code-core';
import * as useTerminalSize from '../hooks/useTerminalSize.js';
import * as useStatusLineModule from '../hooks/useStatusLine.js';
import * as useMCPHealthModule from '../hooks/useMCPHealth.js';
import { type UIState, UIStateContext } from '../contexts/UIStateContext.js';
import {
  BackgroundTaskViewStateContext,
  type BackgroundTaskViewState,
} from '../contexts/BackgroundTaskViewContext.js';
import type { DialogEntry } from '../hooks/useBackgroundTaskView.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { VimModeProvider } from '../contexts/VimModeContext.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import { StreamingState } from '../types.js';

vi.mock('../hooks/useTerminalSize.js');
const useTerminalSizeMock = vi.mocked(useTerminalSize.useTerminalSize);

vi.mock('../hooks/useStatusLine.js');
const useStatusLineMock = vi.mocked(useStatusLineModule.useStatusLine);

vi.mock('../hooks/useMCPHealth.js');
vi.mock('../hooks/use-working-tree-diff.js', () => ({
  useWorkingTreeDiff: () => ({ linesAdded: 31, linesRemoved: 6 }),
}));
const useMCPHealthMock = vi.mocked(useMCPHealthModule.useMCPHealth);

vi.mock('@organizaone/o1-code-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@organizaone/o1-code-core')>();
  const registry = {
    list: vi.fn(() => []),
    subscribe: vi.fn(() => () => {}),
  };
  return {
    ...actual,
    getManagedAutoMemoryDreamTaskRegistry: vi.fn(() => registry),
  };
});

const defaultProps = {
  model: 'gemini-pro',
};

const createMockMemoryManager = () => ({
  subscribe: vi.fn(() => () => {}),
  listTasksByType: vi.fn(() => []),
});

const createMockConfig = (overrides = {}) => ({
  getModel: vi.fn(() => defaultProps.model),
  getModelDisplayName: vi.fn(() => 'glm-5.3'),
  getTargetDir: vi.fn(() => '/test/project'),
  getDebugMode: vi.fn(() => false),
  getContentGeneratorConfig: vi.fn(() => ({ contextWindowSize: 131072 })),
  getMcpServers: vi.fn(() => ({})),
  getBlockedMcpServers: vi.fn(() => []),
  getProjectRoot: vi.fn(() => '/test/project'),
  getSessionId: vi.fn(() => 'test-session'),
  getMemoryManager: vi.fn(createMockMemoryManager),
  isSafeMode: vi.fn(() => false),
  ...overrides,
});

const createMockUIState = (overrides: Partial<UIState> = {}): UIState =>
  ({
    sessionStats: {
      lastPromptTokenCount: 100,
      sessionId: 'test-session',
      metrics: {
        models: {},
        tools: {
          totalCalls: 0,
          totalSuccess: 0,
          totalFail: 0,
          totalDurationMs: 0,
          totalDecisions: { accept: 0, reject: 0, modify: 0, auto_accept: 0 },
          byName: {},
        },
        files: { totalLinesAdded: 0, totalLinesRemoved: 0 },
      },
    },
    currentModel: 'gemini-pro',
    branchName: undefined,
    memoryFileCount: 0,
    contextFileNames: [],
    showToolDescriptions: false,
    ideContextState: undefined,
    startupIdeConnectionStatus: { state: 'idle' },
    isConfigInitialized: true,
    messageQueue: [],
    pendingHistoryItems: [],
    streamingState: StreamingState.Idle,
    ...overrides,
  }) as UIState;

const createMockSettings = (): LoadedSettings =>
  ({
    merged: {
      general: {
        vimMode: false,
      },
    },
  }) as LoadedSettings;

const renderWithWidth = (
  width: number,
  uiState: UIState,
  configOverrides = {},
) => {
  useTerminalSizeMock.mockReturnValue({ columns: width, rows: 24 });
  const mockSettings = createMockSettings();
  return render(
    <SettingsContext.Provider value={mockSettings}>
      <ConfigContext.Provider
        value={createMockConfig(configOverrides) as never}
      >
        <KeypressProvider kittyProtocolEnabled={false}>
          <VimModeProvider settings={mockSettings}>
            <UIStateContext.Provider value={uiState}>
              <Footer />
            </UIStateContext.Provider>
          </VimModeProvider>
        </KeypressProvider>
      </ConfigContext.Provider>
    </SettingsContext.Provider>,
  );
};

const runningShellEntry: DialogEntry = {
  kind: 'shell',
  id: 'shell-1',
  shellId: 'shell-1',
  description: 'sleep 100',
  command: 'sleep 100',
  cwd: '/test/project',
  status: 'running',
  startTime: 0,
  outputFile: '/tmp/shell-1.output',
  outputPath: '/tmp/shell-1.output',
  outputOffset: 0,
  notified: false,
  abortController: new AbortController(),
};

const pendingApprovalAgentEntry: DialogEntry = {
  kind: 'agent',
  id: 'agent-1',
  agentId: 'agent-1',
  description: 'background agent',
  isBackgrounded: true,
  status: 'running',
  startTime: 0,
  outputFile: '/tmp/agent-1.jsonl',
  outputOffset: 0,
  notified: false,
  abortController: new AbortController(),
  pendingApprovals: [
    {
      callId: 'call-1',
      name: 'Shell',
      description: 'run call-1',
      confirmationDetails: {
        type: 'exec',
      } as BackgroundApproval['confirmationDetails'],
      respond: async () => {},
      at: 0,
    },
  ],
};

const createBackgroundTaskState = (
  entries: readonly DialogEntry[],
): BackgroundTaskViewState => ({
  entries,
  selectedIndex: 0,
  dialogMode: 'closed',
  dialogOpen: false,
  pillFocused: false,
  livePanelFocused: false,
  livePanelSelectedIndex: 0,
});

// ink-testing-library hardcodes a 100-column layout buffer regardless of the
// mocked useTerminalSize, so width-sensitive layout regressions cannot be
// reproduced through it. Render through ink directly with a custom stdout so
// the footer lays out at the requested width (DiffDialog.test.tsx pattern).
const renderAtLayoutWidth = (
  columns: number,
  uiState: UIState,
  backgroundEntries: readonly DialogEntry[] = [],
  containerRef?: RefObject<DOMElement | null>,
) => {
  useTerminalSizeMock.mockReturnValue({ columns, rows: 24 });
  let lastFrame = '';
  const stdout = Object.assign(new EventEmitter(), {
    columns,
    rows: 24,
    write: (frame: string) => {
      lastFrame = frame;
    },
  });
  const stderr = Object.assign(new EventEmitter(), {
    columns,
    rows: 24,
    write: () => {},
  });
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    setRawMode: () => {},
    setEncoding: () => {},
    resume: () => {},
    pause: () => {},
    ref: () => {},
    unref: () => {},
    read: () => null,
  });
  const mockSettings = createMockSettings();
  const footer =
    backgroundEntries.length > 0 ? (
      <BackgroundTaskViewStateContext.Provider
        value={createBackgroundTaskState(backgroundEntries)}
      >
        <Footer containerRef={containerRef} />
      </BackgroundTaskViewStateContext.Provider>
    ) : (
      <Footer containerRef={containerRef} />
    );
  const instance = inkRender(
    <SettingsContext.Provider value={mockSettings}>
      <ConfigContext.Provider value={createMockConfig() as never}>
        <KeypressProvider kittyProtocolEnabled={false}>
          <VimModeProvider settings={mockSettings}>
            <UIStateContext.Provider value={uiState}>
              {footer}
            </UIStateContext.Provider>
          </VimModeProvider>
        </KeypressProvider>
      </ConfigContext.Provider>
    </SettingsContext.Provider>,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      // debug:true writes the full frame synchronously at the true width
      // instead of throttled cursor-diff output.
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  );
  return { lastFrame: () => lastFrame, unmount: instance.unmount };
};

describe('<Footer />', () => {
  beforeEach(() => {
    useStatusLineMock.mockReturnValue({
      lines: [],
      useThemeColors: false,
      respectUserColors: false,
      hideContextIndicator: false,
    });
    // Healthy by default so MCPHealthPill renders null, matching the
    // unconfigured registry the real hook sees in these tests.
    useMCPHealthMock.mockReturnValue({
      totalCount: 0,
      disconnectedCount: 0,
      connectingCount: 0,
      connectedCount: 0,
    });
  });

  it('does not show the runtime tool policy in the footer', () => {
    const { lastFrame } = renderWithWidth(180, createMockUIState(), {
      getShellExecutionSandbox: () => ({
        requestedBackend: 'bwrap',
        filesystem: 'read-only',
        network: 'closed',
      }),
    });
    // The sandbox is not shown in the footer (maintainer decision).
    expect(lastFrame()).not.toContain('bwrap');
  });

  it('attaches the selectable-region ref to its outer box', () => {
    const containerRef = createRef<DOMElement>();
    const { unmount } = renderAtLayoutWidth(
      80,
      createMockUIState(),
      [],
      containerRef,
    );

    expect(containerRef.current).not.toBeNull();
    unmount();
  });

  it('hides the "workflow active" indicator by default', () => {
    const { lastFrame } = renderWithWidth(120, createMockUIState());
    expect(lastFrame()).not.toContain('workflow active');
  });

  it('hides the queued-count badge when the queue is empty', () => {
    const { lastFrame } = renderWithWidth(
      120,
      createMockUIState({ messageQueue: [] }),
    );

    expect(lastFrame()).not.toContain('queued');
  });

  it.each([ApprovalMode.AUTO, ApprovalMode.DEFAULT])(
    'keeps the hint row on one line at 80 columns with %s, a queued message, active pills, and a pending skill review',
    (mode) => {
      // Regression: with Responding + the
      // approval-mode indicator + a non-empty queue, the badge had no `wrap`
      // prop, so the shrinkable hint row wrapped and the badge's tail dangled
      // on a second footer line, varying the footer height mid-turn. The
      // skill-pending indicator shares the row and needs the same guard
      // too, and so do the two pills — the badge's
      // ~12 columns of width pressure wraps their unguarded labels onto a
      // second line once the queue is non-empty.
      useMCPHealthMock.mockReturnValue({
        totalCount: 1,
        disconnectedCount: 1,
        connectingCount: 0,
        connectedCount: 0,
      });
      const { lastFrame, unmount } = renderAtLayoutWidth(
        80,
        createMockUIState({
          streamingState: StreamingState.Responding,
          showAutoAcceptIndicator: mode,
          messageQueue: ['queued message'],
          skillReviewPending: {
            taskId: 'test-task',
            skills: [
              {
                name: 'test-skill',
                description: 'a skill awaiting review',
                stagedManifestPath: '/tmp/test-skill/SKILL.md',
              },
            ],
          },
        }),
        [runningShellEntry],
      );
      try {
        // Trim trailing spaces/tabs per line only: `\s` also matches `\n`,
        // which would absorb a trailing blank row and mask height growth.
        const lines = stripAnsi(lastFrame())
          .split('\n')
          .map((line) => line.replace(/[ \t]+$/u, ''));
        expect(lines).toHaveLength(1);
        // The pills and the queue moved out of the footer (activity line,
        // conversation well); the row must still hold the mode zone.
        expect(lines[0]).toContain(
          `${mode === ApprovalMode.AUTO ? 'AUTO' : 'DEFAULT'} │`,
        );
      } finally {
        unmount();
      }
    },
  );

  it('keeps the hint row on one line at 80 columns when a parked approval shares it with a queued message', () => {
    // Regression: the pill's "needs approval"
    // node renders only for agent/workflow entries with parked approvals,
    // which the shell-entry case above never exercises. Without
    // wrap="truncate" on that node, the overflowing row wraps it onto a
    // second footer line.
    const { lastFrame, unmount } = renderAtLayoutWidth(
      80,
      createMockUIState({
        streamingState: StreamingState.Responding,
        messageQueue: ['queued message'],
      }),
      [pendingApprovalAgentEntry],
    );
    try {
      const lines = stripAnsi(lastFrame())
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/u, ''));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('DEFAULT │');
    } finally {
      unmount();
    }
  });

  it('shows deferred IDE connection progress', () => {
    const { lastFrame } = renderWithWidth(
      120,
      createMockUIState({
        startupIdeConnectionStatus: { state: 'connecting' },
      }),
    );

    expect(lastFrame()).toContain(
      'IDE connecting... context may be unavailable',
    );
  });

  it('shows deferred IDE connection failures', () => {
    const { lastFrame } = renderWithWidth(
      120,
      createMockUIState({
        startupIdeConnectionStatus: {
          state: 'failed',
          message: 'ide_connect timed out after 10000ms',
        },
      }),
    );

    // A lasting state shares the row with the other zones, truncated.
    expect(lastFrame()).toContain('IDE connection unavailable: ide_connect');
    expect(lastFrame()).toContain('% ctx');
  });

  it('hides the deferred IDE status after connection succeeds', () => {
    const { lastFrame } = renderWithWidth(
      120,
      createMockUIState({
        startupIdeConnectionStatus: { state: 'connected' },
      }),
    );

    expect(lastFrame()).not.toContain('IDE connecting');
    expect(lastFrame()).not.toContain('IDE connection unavailable');
    expect(lastFrame()).toContain('DEFAULT │');
  });

  it('shows the default approval mode badge when in DEFAULT mode', () => {
    const { lastFrame } = renderWithWidth(
      120,
      createMockUIState({
        showAutoAcceptIndicator: ApprovalMode.DEFAULT,
      }),
    );
    const frame = lastFrame()!;
    expect(frame).toContain('DEFAULT │ glm-5.3');
  });

  it('shows the whole turn time, not the time since the last approval', () => {
    const frame = renderWithWidth(
      120,
      createMockUIState({
        streamingState: StreamingState.Responding,
        turnStartedAt: Date.now() - 182_000,
      } as Partial<UIState>),
    ).lastFrame()!;
    expect(frame).toContain('3m 02s');
  });

  it('keeps one column from the edge under 80 columns (spec §8)', () => {
    const narrow = renderWithWidth(70, createMockUIState()).lastFrame()!;
    expect(narrow.split('\n')[0]).toMatch(/^ \S/);
    const wide = renderWithWidth(120, createMockUIState()).lastFrame()!;
    expect(wide.split('\n')[0]).toMatch(/^ {2}\S/);
  });

  it('shows a dash for the model and no provider when none is connected', () => {
    const { lastFrame } = renderWithWidth(120, createMockUIState(), {
      getContentGeneratorConfig: vi.fn(() => undefined),
    });
    const frame = lastFrame()!;
    expect(frame).toContain('│ —');
    expect(frame).not.toContain('glm-5.3');
    expect(frame).toContain('no provider');
  });

  it('does not display the working directory or branch name', () => {
    const { lastFrame } = renderWithWidth(120, createMockUIState());
    expect(lastFrame()).not.toMatch(/\(.*\*\)/);
  });

  it('displays the context percentage', () => {
    const { lastFrame } = renderWithWidth(120, createMockUIState());
    expect(lastFrame()).toContain('% ctx');
  });

  it('displays the abbreviated context percentage on narrow terminal', () => {
    const { lastFrame } = renderWithWidth(99, createMockUIState());
    expect(lastFrame()).toMatch(/\d+%/);
  });

  describe('three zones', () => {
    const VS15 = String.fromCharCode(0xfe0e);

    it('shows mode and model, branch and diff, and usage on one row', () => {
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({
          branchName: 'main',
          showAutoAcceptIndicator: ApprovalMode.AUTO,
        }),
      );
      const frame = stripAnsi(lastFrame() ?? '').replaceAll(VS15, '');
      expect(frame.split('\n')).toHaveLength(1);
      expect(frame).toContain('● AUTO │ glm-5.3');
      expect(frame).toContain('⎇ main +31 -6');
      expect(frame).toContain('% ctx');
      expect(frame).toContain('● online');
    });

    it('lets a transient notice take the first zone', () => {
      const { lastFrame } = renderWithWidth(
        80,
        createMockUIState({
          ctrlCPressedOnce: true,
          showAutoAcceptIndicator: ApprovalMode.AUTO,
        }),
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Press Ctrl+C again to exit.');
      expect(frame).not.toContain('AUTO │');
    });

    it('keeps the zones while a lasting state shows in the first one', () => {
      for (const state of [
        { shellModeActive: true },
        {
          startupIdeConnectionStatus: {
            state: 'failed',
            message: 'ide_connect timed out',
          },
        },
      ] as Array<Partial<UIState>>) {
        const frame = renderWithWidth(
          120,
          createMockUIState(state),
        ).lastFrame();
        expect(frame).toContain('% ctx');
      }
    });

    it('shows online again once a retried request streams its answer', () => {
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({
          pendingHistoryItems: [{ type: 'error', text: '429' }],
          isReceivingContent: true,
        } as Partial<UIState>),
      );
      expect(lastFrame()).toContain('online');
    });

    it('shows a failed request while an error is pending', () => {
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({
          pendingHistoryItems: [{ type: 'error', text: '429' }],
        } as Partial<UIState>),
      );
      expect(lastFrame()).toContain('failed');
    });
  });

  describe('status line rendering', () => {
    it('renders multi-line status line output', () => {
      useStatusLineMock.mockReturnValue({
        lines: ['model-name (main) ctx:34%', '████░░░░ 34% context'],
        useThemeColors: false,
        respectUserColors: false,
        hideContextIndicator: false,
      });
      const { lastFrame } = renderWithWidth(120, createMockUIState());
      const frame = lastFrame()!;
      expect(frame).toContain('model-name (main) ctx:34%');
      expect(frame).toContain('████░░░░ 34% context');
    });

    it('wraps long status line output without growing past two lines', () => {
      const longLine = [
        'visible-start',
        ...Array.from({ length: 40 }, (_, index) => `chunk-${index}`),
        'hidden-tail',
      ].join(' ');
      useStatusLineMock.mockReturnValue({
        lines: [longLine],
        useThemeColors: false,
        respectUserColors: false,
        hideContextIndicator: false,
      });
      const { lastFrame } = renderWithWidth(16, createMockUIState());
      const frame = lastFrame()!;
      expect(frame).toContain('visible-start');
      expect(frame).toContain('chunk-10');
      expect(frame).not.toContain('hidden-tail');
      expect(frame).not.toContain('? for shortcuts');
    });

    it('clips later status line entries after wrapped output reaches two lines', () => {
      const longLine = [
        'first-line-start',
        ...Array.from({ length: 40 }, (_, index) => `part-${index}`),
        'first-line-tail',
      ].join(' ');
      useStatusLineMock.mockReturnValue({
        lines: [longLine, 'second-status-line'],
        useThemeColors: false,
        respectUserColors: false,
        hideContextIndicator: false,
      });
      const { lastFrame } = renderWithWidth(16, createMockUIState());
      const frame = lastFrame()!;
      expect(frame).toContain('first-line-start');
      expect(frame).not.toContain('first-line-tail');
      expect(frame).not.toContain('second-status-line');
      expect(frame).not.toContain('? for shortcuts');
    });

    it('suppresses hint when status line is active', () => {
      useStatusLineMock.mockReturnValue({
        lines: ['status info'],
        useThemeColors: false,
        respectUserColors: false,
        hideContextIndicator: false,
      });
      const { lastFrame } = renderWithWidth(120, createMockUIState());
      expect(lastFrame()).not.toContain('? for shortcuts');
    });

    it('renders status line with respectUserColors enabled', () => {
      useStatusLineMock.mockReturnValue({
        lines: ['\x1b[38;2;99;102;241m🤖 o1-code\x1b[0m'],
        useThemeColors: false,
        respectUserColors: true,
        hideContextIndicator: false,
      });
      const { lastFrame } = renderWithWidth(120, createMockUIState());
      const frame = lastFrame()!;
      expect(frame).toContain('🤖 o1-code');
    });

    it('hides context indicator when hideContextIndicator is true', () => {
      useStatusLineMock.mockReturnValue({
        lines: [],
        useThemeColors: false,
        respectUserColors: false,
        hideContextIndicator: true,
      });
      const { lastFrame } = renderWithWidth(120, createMockUIState());
      expect(lastFrame()).not.toMatch(/\d+(\.\d+)?% context used/);
    });
  });

  describe('config init message', () => {
    it('shows init status in place of the hint while config is initializing', () => {
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({ isConfigInitialized: false }),
      );
      const frame = lastFrame()!;
      expect(frame).toContain('Initializing...');
      expect(frame).not.toContain('? for shortcuts');
    });

    it('falls back to the hint once config is initialized', () => {
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({ isConfigInitialized: true }),
      );
      const frame = lastFrame()!;
      expect(frame).not.toContain('Initializing...');
      expect(frame).toContain('DEFAULT │');
    });

    // Init progress is more useful than zero layout shift: we show it even
    // when a custom status line is active, accepting that the row shrinks
    // by one line once init completes. Still strictly better than the
    // original bug (a 2-row residual above the input in the default case).
    it('shows init status over a custom status line while initializing', () => {
      useStatusLineMock.mockReturnValue({
        lines: ['model-name ctx:34%'],
        useThemeColors: false,
        respectUserColors: false,
        hideContextIndicator: false,
      });
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({ isConfigInitialized: false }),
      );
      const frame = lastFrame()!;
      // A transient notice takes the whole row while it applies.
      expect(frame).toContain('Initializing...');
    });
  });

  describe('footer rendering (golden snapshots)', () => {
    it('renders complete footer on wide terminal', () => {
      const { lastFrame } = renderWithWidth(120, createMockUIState());
      expect(lastFrame()).toMatchSnapshot('complete-footer-wide');
    });

    it('renders complete footer on narrow terminal', () => {
      const { lastFrame } = renderWithWidth(79, createMockUIState());
      expect(lastFrame()).toMatchSnapshot('complete-footer-narrow');
    });
  });
});
