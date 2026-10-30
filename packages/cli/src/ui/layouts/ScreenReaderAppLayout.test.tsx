/**
 * @license
 * Copyright 2025 O1-Code
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { ScreenReaderAppLayout } from './ScreenReaderAppLayout.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import { StreamingState } from '../types.js';

const dialogManagerMockState = vi.hoisted(() => ({
  lineCount: 1,
  probe: false,
  backgroundOpen: false,
}));
vi.mock('../contexts/BackgroundTaskViewContext.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../contexts/BackgroundTaskViewContext.js')
  >()),
  useBackgroundTaskViewState: () => ({
    entries: [],
    selectedIndex: 0,
    dialogMode: dialogManagerMockState.backgroundOpen ? 'list' : 'closed',
    dialogOpen: dialogManagerMockState.backgroundOpen,
    pillFocused: false,
    livePanelFocused: false,
    livePanelSelectedIndex: 0,
  }),
}));

vi.mock('../components/Notifications.js', () => ({
  Notifications: () => <Text>Notifications</Text>,
}));

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
    <Text wrap="truncate-end">
      {dialogManagerMockState.probe
        ? 'W'.repeat(106) + 'RIGHT_EDGE'
        : Array.from(
            { length: dialogManagerMockState.lineCount },
            (_, i) => `DialogManager ${i + 1}`,
          ).join('\n')}
    </Text>
  ),
}));

vi.mock('../components/Composer.js', () => ({
  Composer: () => <Text>Composer</Text>,
}));

vi.mock('../components/Footer.js', () => ({
  Footer: () => <Text>Footer</Text>,
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

const baseUIState: Partial<UIState> = {
  dialogsVisible: false,
  isFeedbackDialogOpen: false,
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
    <UIStateContext.Provider value={uiState as UIState}>
      <ScreenReaderAppLayout />
    </UIStateContext.Provider>,
  );

function frameHeight(frame: string): number {
  return frame.length === 0 ? 0 : frame.split('\n').length;
}

describe('ScreenReaderAppLayout', () => {
  beforeEach(() => {
    dialogManagerMockState.lineCount = 1;
    dialogManagerMockState.probe = false;
    dialogManagerMockState.backgroundOpen = false;
  });

  it('does not clip the right edge of the wide agent dashboard in screen reader layout', () => {
    dialogManagerMockState.probe = true;
    dialogManagerMockState.backgroundOpen = true;
    const { lastFrame } = renderLayout({
      ...baseUIState,
      terminalWidth: 120,
      mainAreaWidth: 100,
      dialogsVisible: true,
    });
    expect(lastFrame()).toContain('RIGHT_EDGE');
  });

  it('renders sticky todo list before the composer', () => {
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

  it('does not render sticky todo list when dialogs are visible', () => {
    const { lastFrame } = renderLayout({
      ...baseUIState,
      dialogsVisible: true,
    });

    const output = lastFrame() ?? '';
    expect(output).not.toContain('StickyTodoList');
    expect(output).toContain('DialogManager 1');
  });

  it('renders update notifications when no dialog is visible', () => {
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

    expect(lastFrame() ?? '').toContain(
      'UpdateNotification: Update successful!',
    );
  });

  it('does not render update notifications when dialogs are visible', () => {
    const { lastFrame } = renderLayout({
      ...baseUIState,
      dialogsVisible: true,
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

    expect(lastFrame() ?? '').not.toContain('UpdateNotification');
  });

  it('keeps a tall dialog within the terminal frame when constrained', () => {
    dialogManagerMockState.lineCount = 20;
    const terminalHeight = 8;

    const { lastFrame } = renderLayout({
      ...baseUIState,
      dialogsVisible: true,
      terminalHeight,
      staticExtraHeight: 3,
    });

    const output = lastFrame() ?? '';
    expect(frameHeight(output)).toBeLessThanOrEqual(terminalHeight);
    expect(output).toContain('DialogManager 1');
    expect(output).not.toContain('DialogManager 20');
  });

  it('reserves compact update choices without competing footer and history rows', () => {
    dialogManagerMockState.lineCount = 6;
    const { lastFrame } = renderLayout({
      ...baseUIState,
      dialogsVisible: true,
      terminalHeight: 10,
      staticExtraHeight: 3,
      ctrlCPressedOnce: true,
      applicationUpdate: { visible: true } as UIState['applicationUpdate'],
    });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('DialogManager 6');
    expect(frame).not.toContain('MainContent');
    expect(frame).not.toContain('Footer');
    expect(frame).not.toContain('Notifications');
    expect(frameHeight(frame)).toBeLessThanOrEqual(10);
  });

  it('does not cap a tall dialog when height constraints are disabled', () => {
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

  it('does not render sticky todo list while waiting for confirmation', () => {
    const { lastFrame } = renderLayout({
      ...baseUIState,
      streamingState: StreamingState.WaitingForConfirmation,
    });

    const output = lastFrame() ?? '';
    expect(output).not.toContain('StickyTodoList');
    expect(output).toContain('Composer');
  });

  it('does not render sticky todo list when agent is idle', () => {
    const { lastFrame } = renderLayout({
      ...baseUIState,
      streamingState: StreamingState.Idle,
    });

    const output = lastFrame() ?? '';
    expect(output).not.toContain('StickyTodoList');
    expect(output).toContain('Composer');
  });

  it('does not render sticky todo list when feedback dialog is open', () => {
    const { lastFrame } = renderLayout({
      ...baseUIState,
      isFeedbackDialogOpen: true,
    });

    const output = lastFrame() ?? '';
    expect(output).not.toContain('StickyTodoList');
    expect(output).toContain('Composer');
  });
});
