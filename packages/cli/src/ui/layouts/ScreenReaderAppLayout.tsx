/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { Notifications } from '../components/Notifications.js';
import { UpdateNotification } from '../components/UpdateNotification.js';
import { MainContent } from '../components/MainContent.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { Footer } from '../components/Footer.js';
import { ExitWarning } from '../components/ExitWarning.js';
import { StickyTodoList } from '../components/StickyTodoList.js';
import { BtwMessage } from '../components/messages/BtwMessage.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { StreamingState } from '../types.js';
import { getStickyTodoMaxVisibleItemsForMode } from '../utils/todoSnapshot.js';
import {
  getApplicationUpdateDialogMaxHeight,
  getDialogMaxHeight,
} from '../utils/layoutUtils.js';
import { getLayoutTier, sideMargin } from '../utils/layout-tier.js';
import { useBackgroundTaskViewState } from '../contexts/BackgroundTaskViewContext.js';

export const ScreenReaderAppLayout: React.FC = () => {
  const uiState = useUIState();
  const { dialogOpen: backgroundDialogOpen } = useBackgroundTaskViewState();
  const backgroundMargin = sideMargin(getLayoutTier(uiState.terminalWidth));
  const stickyTodoWidth = Math.min(uiState.mainAreaWidth, 64);
  const stickyTodoMaxVisibleItems = getStickyTodoMaxVisibleItemsForMode(
    uiState.terminalHeight,
    uiState.useTerminalBuffer,
  );
  const inlineDialogMaxHeight = getDialogMaxHeight(
    uiState.terminalHeight,
    uiState.staticExtraHeight,
  );
  const updateDialogMaxHeight = getApplicationUpdateDialogMaxHeight(
    uiState.terminalHeight,
    uiState.staticExtraHeight,
    0,
    (uiState.ctrlCPressedOnce ? 2 : 0) + (uiState.ctrlDPressedOnce ? 2 : 0),
  );
  const isCompactUpdate =
    uiState.applicationUpdate?.visible &&
    updateDialogMaxHeight > inlineDialogMaxHeight;
  const dialogMaxHeight = isCompactUpdate
    ? updateDialogMaxHeight
    : inlineDialogMaxHeight;
  const dialogHeight = uiState.constrainHeight ? dialogMaxHeight : undefined;
  const shouldShowStickyTodos =
    uiState.stickyTodos !== null &&
    !uiState.dialogsVisible &&
    !uiState.isFeedbackDialogOpen &&
    uiState.streamingState === StreamingState.Responding;

  return (
    <Box
      flexDirection="column"
      width={backgroundDialogOpen ? uiState.terminalWidth : '90%'}
      height="100%"
    >
      {!uiState.dialogsVisible && uiState.updateInfo && (
        <UpdateNotification message={uiState.updateInfo.message} />
      )}
      {!isCompactUpdate && <Notifications />}
      {!isCompactUpdate && <Footer />}
      <Box
        flexGrow={isCompactUpdate ? 0 : 1}
        height={isCompactUpdate ? 0 : undefined}
        overflow="hidden"
      >
        <MainContent />
      </Box>

      {uiState.dialogsVisible ? (
        <Box
          marginX={backgroundDialogOpen ? backgroundMargin : 2}
          flexDirection="column"
          width={
            backgroundDialogOpen
              ? Math.max(1, uiState.terminalWidth - backgroundMargin * 2)
              : uiState.mainAreaWidth
          }
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
          <Composer />
        </>
      )}

      <ExitWarning />
    </Box>
  );
};
