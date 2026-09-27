/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { extendedTheme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';
import { QueuedMessageDisplay, getQueueRows } from './QueuedMessageDisplay.js';
import { StreamingState } from '../types.js';

export const WELL_BORDER_ROWS = 2;
/** Columns the well takes from the conversation width: two borders and the scrollbar. */
export const WELL_SIDE_COLUMNS = 3;

export function getConversationChromeHeight(
  queueLength: number,
  thinking = false,
): number {
  return WELL_BORDER_ROWS + getQueueRows(queueLength) + (thinking ? 1 : 0);
}

/** Whether the well shows the agent's working line under the history. */
export function isThinkingLineVisible(
  streamingState: StreamingState,
  embeddedShellFocused: boolean,
): boolean {
  return streamingState === StreamingState.Responding && !embeddedShellFocused;
}

export interface ConversationWellProps {
  viewportHeight: number;
  messageQueue: readonly string[];
  /** The working line, drawn under the history and above the queue. */
  thinking?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The conversation window of the full-screen layout. Its height is fixed so the
 * border reaches the input even when the history is short; the queue sits at
 * the bottom, below the scrolling area.
 */
export const ConversationWell: React.FC<ConversationWellProps> = ({
  viewportHeight,
  messageQueue,
  thinking,
  children,
}) => (
  <Box
    flexDirection="column"
    flexShrink={0}
    height={
      viewportHeight +
      getConversationChromeHeight(messageQueue.length, Boolean(thinking))
    }
    borderStyle={glyphs().borderStyle}
    borderColor={extendedTheme.ui.rule}
  >
    <Box flexDirection="column" height={viewportHeight} flexShrink={0}>
      {children}
    </Box>
    {thinking && (
      <Box paddingX={2} flexShrink={0}>
        {thinking}
      </Box>
    )}
    {messageQueue.length > 0 && (
      <Box paddingX={2} flexShrink={0}>
        <QueuedMessageDisplay messageQueue={messageQueue} />
      </Box>
    )}
  </Box>
);
