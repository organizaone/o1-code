/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { Box, type DOMElement } from 'ink';
import { MainContent } from '../components/MainContent.js';
import {
  ScrollContext,
  type ScrollActions,
} from '../contexts/ScrollContext.js';
import { AppHeader } from '../components/AppHeader.js';
import { getFixedHeaderHeight } from '../components/Header.js';
import { UpdateNotification } from '../components/UpdateNotification.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { ExitWarning } from '../components/ExitWarning.js';
import { StickyTodoList } from '../components/StickyTodoList.js';
import { BtwMessage } from '../components/messages/BtwMessage.js';
import { AgentTabBar } from '../components/agent-view/AgentTabBar.js';
import { AgentChatView } from '../components/agent-view/AgentChatView.js';
import { AgentComposer } from '../components/agent-view/AgentComposer.js';
import { LiveAgentPanel } from '../components/background-view/LiveAgentPanel.js';
import { getLiveAgentPanelVpMaxRows } from '../components/background-view/liveAgentPanelVisibility.js';
import { ContextMenuOverlay } from '../context-menu/ContextMenuOverlay.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAppContext } from '../contexts/AppContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useAgentViewState } from '../contexts/AgentViewContext.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { StreamingState } from '../types.js';
import { getStickyTodoMaxVisibleItemsForMode } from '../utils/todoSnapshot.js';
import { getDialogMaxHeight } from '../utils/layoutUtils.js';

/** The header pinned above the conversation in full-screen mode. */
const PinnedHeader: React.FC = () => {
  const { version } = useAppContext();
  return <AppHeader version={version} pinned />;
};

export const DefaultAppLayout: React.FC = () => {
  const uiState = useUIState();
  const footerRef = useRef<DOMElement>(null);
  const inputLinesRef = useRef<DOMElement | null>(null);
  const scrollActionsRef = useRef<ScrollActions | null>(null);
  const scrollActions = useMemo<ScrollActions>(
    () => ({
      scrollBy: (delta: number) => scrollActionsRef.current?.scrollBy(delta),
      hasScrollableTranscript: () =>
        scrollActionsRef.current?.hasScrollableTranscript() ?? false,
    }),
    [],
  );
  const { refreshStatic } = useUIActions();
  const { activeView, agents } = useAgentViewState();
  const { columns: terminalWidth } = useTerminalSize();
  const hasAgents = agents.size > 0;
  const isAgentTab = activeView !== 'main' && agents.has(activeView);
  const stickyTodoWidth = Math.min(uiState.mainAreaWidth, 64);
  const stickyTodoMaxVisibleItems = getStickyTodoMaxVisibleItemsForMode(
    uiState.terminalHeight,
    uiState.useTerminalBuffer,
  );
  const dialogMaxHeight = getDialogMaxHeight(
    uiState.terminalHeight,
    uiState.staticExtraHeight,
    uiState.useTerminalBuffer ? getFixedHeaderHeight(terminalWidth) : 0,
  );
  const dialogHeight = uiState.constrainHeight ? dialogMaxHeight : undefined;
  const shouldShowStickyTodos =
    uiState.stickyTodos !== null &&
    !uiState.dialogsVisible &&
    !uiState.isFeedbackDialogOpen &&
    uiState.streamingState === StreamingState.Responding;

  // Clear terminal on view switch so previous view's <Static> output
  // is removed. refreshStatic clears the terminal and bumps the
  // historyRemountKey so MainContent's <Static> re-renders all items
  // when switching back.
  const prevViewRef = useRef(activeView);
  useEffect(() => {
    if (prevViewRef.current !== activeView) {
      prevViewRef.current = activeView;
      refreshStatic();
    }
  }, [activeView, refreshStatic]);

  return (
    <Box flexDirection="column" width={terminalWidth}>
      {uiState.useTerminalBuffer && <PinnedHeader />}
      {isAgentTab ? (
        <>
          {/* Agent view: chat history + agent-specific composer */}
          <AgentChatView agentId={activeView} />
          <Box flexDirection="column" ref={uiState.mainControlsRef}>
            {!uiState.useTerminalBuffer &&
              !uiState.dialogsVisible &&
              uiState.updateInfo && (
                <UpdateNotification message={uiState.updateInfo.message} />
              )}
            <AgentComposer key={activeView} agentId={activeView} />
            <ExitWarning />
          </Box>
        </>
      ) : (
        <ScrollContext.Provider value={scrollActions}>
          {/* Main view: conversation history + main composer / dialogs */}
          <MainContent
            footerRef={footerRef}
            inputLinesRef={inputLinesRef}
            scrollActionsRef={scrollActionsRef}
          />
          <Box flexDirection="column" ref={uiState.mainControlsRef}>
            {!uiState.useTerminalBuffer &&
              !uiState.dialogsVisible &&
              uiState.updateInfo && (
                <UpdateNotification message={uiState.updateInfo.message} />
              )}
            {uiState.dialogsVisible ? (
              <Box
                marginX={2}
                flexDirection="column"
                width={uiState.mainAreaWidth}
                height={dialogHeight}
                overflow={uiState.constrainHeight ? 'hidden' : undefined}
              >
                <DialogManager
                  terminalWidth={uiState.terminalWidth}
                  addItem={uiState.historyManager.addItem}
                />
              </Box>
            ) : (
              <>
                {shouldShowStickyTodos && (
                  <StickyTodoList
                    todos={uiState.stickyTodos!}
                    width={stickyTodoWidth}
                    maxVisibleItems={stickyTodoMaxVisibleItems}
                  />
                )}
                {uiState.btwItem && (
                  <Box marginX={2} width={uiState.mainAreaWidth}>
                    <BtwMessage
                      btw={uiState.btwItem.btw}
                      containerWidth={uiState.mainAreaWidth}
                    />
                  </Box>
                )}
                <Composer footerRef={footerRef} inputLinesRef={inputLinesRef} />
              </>
            )}
            <ExitWarning />
            {/*
              LiveAgentPanel — always-on roster of running subagents,
              anchored beneath the input footer (mirrors Claude Code's
              CoordinatorAgentStatus position). Hidden whenever any
              dialog is open (auth / permission / background tasks /
              etc.) so the modal surface doesn't compete with the
              live roster, and the panel's own internal self-hide
              handles the empty-roster case.

              The panel renders INSIDE `mainControlsRef` so its rows
              are picked up by `measureElement` in `AppContainer`'s
              `controlsHeight` useLayoutEffect — `availableTerminalHeight`
              then subtracts the panel's footprint and pending history
              items in MainContent stop racing it for screen real
              estate. (Pre-fix: the panel rendered outside the ref,
              long Read/Bash output could push the composer + panel
              off-screen — a regression vs the earlier suppression of
              the inline frame in the live phase.)

              Panel uses `terminalWidth`, not `mainAreaWidth` —
              `mainAreaWidth` is hard-capped at 100 cols (intended
              for markdown / code blocks where soft-wrap matters);
              live progress lines have nothing to soft-wrap, so the
              panel wants the full terminal width.
            */}
            {!uiState.dialogsVisible && (
              <LiveAgentPanel
                width={uiState.terminalWidth}
                maxRows={
                  uiState.useTerminalBuffer
                    ? getLiveAgentPanelVpMaxRows(uiState.terminalHeight)
                    : undefined
                }
              />
            )}
          </Box>
        </ScrollContext.Provider>
      )}

      {/* Tab bar: visible whenever in-process agents exist and input is active */}
      {hasAgents && !uiState.dialogsVisible && <AgentTabBar />}

      {/* Right-click context menu: absolutely-positioned overlay, drawn last
          so it paints over the transcript. Renders nothing while closed. */}
      <ContextMenuOverlay />
    </Box>
  );
};
