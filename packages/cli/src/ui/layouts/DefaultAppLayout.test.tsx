/**
 * @license
 * Copyright 2025 O1-Code
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { DefaultAppLayout } from './DefaultAppLayout.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from '../contexts/UIActionsContext.js';
import { useAgentViewState } from '../contexts/AgentViewContext.js';
import { StreamingState } from '../types.js';

const dialogManagerMockState = vi.hoisted(() => ({ lineCount: 1 }));

vi.mock('../components/MainContent.js', () => ({
  MainContent: () => <Text>MainContent</Text>,
}));

vi.mock('../components/UpdateNotification.js', () => ({
  UpdateNotification: ({ message }: { message: string }) => (
    <Text>{`UpdateNotification: ${message}`}</Text>
  ),
}));

vi.mock('../components/DialogManager.js', () => ({
  DialogManager: () => (
    <Text>
      {Array.from(
        { length: dialogManagerMockState.lineCount },
        (_, i) => `DialogManager ${i + 1}`,
      ).join('\n')}
    </Text>
  ),
}));

vi.mock('../components/Composer.js', () => ({
  Composer: () => <Text>Composer</Text>,
}));

vi.mock('../components/ExitWarning.js', () => ({
  ExitWarning: () => <Text>ExitWarning</Text>,
}));

vi.mock('../components/messages/BtwMessage.js', () => ({
  BtwMessage: () => <Text>BtwMessage</Text>,
}));

vi.mock('../components/StickyTodoList.js', () => ({
  StickyTodoList: () => <Text>StickyTodoList</Text>,
}));

vi.mock('../components/agent-view/AgentTabBar.js', () => ({
  AgentTabBar: () => <Text>AgentTabBar</Text>,
}));

vi.mock('../components/agent-view/AgentChatView.js', () => ({
  AgentChatView: () => <Text>AgentChatView</Text>,
}));

vi.mock('../components/agent-view/AgentComposer.js', () => ({
  AgentComposer: () => <Text>AgentComposer</Text>,
}));

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: 80 }),
}));

vi.mock('../components/AppHeader.js', () => ({
  AppHeader: () => <Text>AppHeader</Text>,
}));

vi.mock('../contexts/AppContext.js', () => ({
  useAppContext: () => ({ version: '0.1.0' }),
}));

vi.mock('../contexts/AgentViewContext.js', () => ({
  useAgentViewState: vi.fn(),
}));

const mockedUseAgentViewState = useAgentViewState as Mock;

const mockUIActions = {
  refreshStatic: vi.fn(),
} as unknown as UIActions;

const baseUIState: Partial<UIState> = {
  dialogsVisible: false,
  isFeedbackDialogOpen: false,
  mainControlsRef: { current: null },
  mainAreaWidth: 80,
  terminalWidth: 80,
  terminalHeight: 24,
  staticExtraHeight: 0,
  constrainHeight: true,
  streamingState: StreamingState.Responding,
  historyManager: {
    addItem: vi.fn(),
    history: [],
    updateItem: vi.fn(),
    clearItems: vi.fn(),
    loadHistory: vi.fn(),
    truncateToItem: vi.fn(),
    compactOldItems: vi.fn(),
  },
  stickyTodos: [
    {
      id: 'todo-1',
      content: 'Pinned task',
      status: 'pending',
    },
  ],
  btwItem: null,
};

const renderLayout = (uiState: Partial<UIState>) =>
  render(
    <UIActionsContext.Provider value={mockUIActions}>
      <UIStateContext.Provider value={uiState as UIState}>
        <DefaultAppLayout />
      </UIStateContext.Provider>
    </UIActionsContext.Provider>,
  );

function frameHeight(frame: string): number {
  return frame.length === 0 ? 0 : frame.split('\n').length;
}

describe('DefaultAppLayout', () => {
  beforeEach(() => {
    dialogManagerMockState.lineCount = 1;
  });

  it('renders sticky todo list before the composer in the main view', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });

    const { lastFrame } = renderLayout(baseUIState);
    const output = lastFrame() ?? '';

    expect(output).toContain('StickyTodoList');
    expect(output.indexOf('StickyTodoList')).toBeGreaterThan(
      output.indexOf('MainContent'),
    );
    expect(output.indexOf('StickyTodoList')).toBeLessThan(
      output.indexOf('Composer'),
    );
  });

  it('renders an update that arrives after startup above the composer', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });

    const { lastFrame } = renderLayout({
      ...baseUIState,
      updateInfo: {
        message: 'Update successful!',
        update: {
          latest: '0.20.0',
          current: '0.19.12',
          type: 'latest',
          name: '@organizaone/o1-code',
        },
      },
    });
    const output = lastFrame() ?? '';

    expect(output).toContain('UpdateNotification: Update successful!');
    expect(output.indexOf('UpdateNotification')).toBeLessThan(
      output.indexOf('Composer'),
    );
  });

  it('does not render sticky todo list when dialogs are visible', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });

    const { lastFrame } = renderLayout({
      ...baseUIState,
      dialogsVisible: true,
    });

    const output = lastFrame() ?? '';
    expect(output).not.toContain('StickyTodoList');
    expect(output).toContain('DialogManager 1');
  });

  it('keeps a tall dialog within the terminal frame when it appears', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });
    dialogManagerMockState.lineCount = 20;
    const terminalHeight = 8;

    const { lastFrame } = renderLayout({
      ...baseUIState,
      dialogsVisible: true,
      terminalHeight,
    });

    const output = lastFrame() ?? '';
    expect(frameHeight(output)).toBeLessThanOrEqual(terminalHeight);
    expect(output).toContain('DialogManager 1');
    expect(output).not.toContain('DialogManager 20');
  });

  it('does not cap a tall dialog when height constraints are disabled', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });
    dialogManagerMockState.lineCount = 20;
    const terminalHeight = 8;

    const { lastFrame } = renderLayout({
      ...baseUIState,
      dialogsVisible: true,
      terminalHeight,
      constrainHeight: false,
    });

    const output = lastFrame() ?? '';
    expect(frameHeight(output)).toBeGreaterThan(terminalHeight);
    expect(output).toContain('DialogManager 20');
  });

  it('lets a short approval panel leave room for the conversation', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });
    const { lastFrame } = renderLayout({
      ...baseUIState,
      dialogsVisible: true,
      isApprovalModeDialogOpen: true,
      terminalHeight: 40,
    });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('DialogManager 1');
    expect(frameHeight(frame)).toBeLessThan(10);
  });

  it('still clips a tall approval panel to the available terminal height', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });
    dialogManagerMockState.lineCount = 20;
    const { lastFrame } = renderLayout({
      ...baseUIState,
      dialogsVisible: true,
      isApprovalModeDialogOpen: true,
      terminalHeight: 8,
    });
    const frame = lastFrame() ?? '';
    expect(frameHeight(frame)).toBeLessThanOrEqual(8);
    expect(frame).not.toContain('DialogManager 20');
  });

  it('does not render sticky todo list while waiting for confirmation', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });

    const { lastFrame } = renderLayout({
      ...baseUIState,
      streamingState: StreamingState.WaitingForConfirmation,
    });

    const output = lastFrame() ?? '';
    expect(output).not.toContain('StickyTodoList');
    expect(output).toContain('Composer');
  });

  it('does not render sticky todo list when agent is idle', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });

    const { lastFrame } = renderLayout({
      ...baseUIState,
      streamingState: StreamingState.Idle,
    });

    const output = lastFrame() ?? '';
    expect(output).not.toContain('StickyTodoList');
    expect(output).toContain('Composer');
  });

  it('does not render sticky todo list when feedback dialog is open', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'main',
      agents: new Map(),
    });

    const { lastFrame } = renderLayout({
      ...baseUIState,
      isFeedbackDialogOpen: true,
    });

    const output = lastFrame() ?? '';
    expect(output).not.toContain('StickyTodoList');
    expect(output).toContain('Composer');
  });

  it('does not render sticky todo list in an agent tab view', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'agent-1',
      agents: new Map([['agent-1', {}]]),
    });

    const { lastFrame } = renderLayout(baseUIState);

    const output = lastFrame() ?? '';
    expect(output).not.toContain('StickyTodoList');
    expect(output).toContain('AgentChatView');
    expect(output).toContain('AgentComposer');
  });

  it('renders update notifications in an agent tab view', () => {
    mockedUseAgentViewState.mockReturnValue({
      activeView: 'agent-1',
      agents: new Map([['agent-1', {}]]),
    });

    const { lastFrame } = renderLayout({
      ...baseUIState,
      updateInfo: {
        message: 'Update successful!',
        update: {
          latest: '0.20.0',
          current: '0.19.12',
          type: 'latest',
          name: '@organizaone/o1-code',
        },
      },
    });
    const output = lastFrame() ?? '';

    expect(output).toContain('UpdateNotification: Update successful!');
    expect(output.indexOf('UpdateNotification')).toBeLessThan(
      output.indexOf('AgentComposer'),
    );
  });
  describe('pinned header', () => {
    const updateInfo = {
      message: 'update!',
      update: {
        latest: '0.1.1',
        current: '0.1.0',
        type: 'minor',
        name: 'o1-code',
      },
    };

    beforeEach(() => {
      mockedUseAgentViewState.mockReturnValue({
        activeView: 'main',
        agents: new Map(),
      });
    });

    it('pins the header above the conversation in the full-screen mode', () => {
      const frame =
        renderLayout({ ...baseUIState, useTerminalBuffer: true }).lastFrame() ??
        '';
      expect(frame).toContain('AppHeader');
      expect(frame.indexOf('AppHeader')).toBeLessThan(
        frame.indexOf('MainContent'),
      );
    });

    it('leaves the header to the scrolling history in the other modes', () => {
      expect(
        renderLayout({ ...baseUIState, useTerminalBuffer: false }).lastFrame(),
      ).not.toContain('AppHeader');
    });

    it('keeps the update box only when the header is not pinned', () => {
      expect(
        renderLayout({
          ...baseUIState,
          useTerminalBuffer: true,
          updateInfo,
        }).lastFrame(),
      ).not.toContain('UpdateNotification');
      expect(
        renderLayout({
          ...baseUIState,
          useTerminalBuffer: false,
          updateInfo,
        }).lastFrame(),
      ).toContain('UpdateNotification: update!');
    });
  });
});
