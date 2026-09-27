/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { t } from '../../i18n/index.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';

export const MAX_DISPLAYED_QUEUED_MESSAGES = 3;

export function getQueueRows(count: number): number {
  return Math.min(count, MAX_DISPLAYED_QUEUED_MESSAGES);
}

export interface QueuedMessageDisplayProps {
  messageQueue: readonly string[];
  showHint?: boolean;
}

export const QueuedMessageDisplay = ({
  messageQueue,
  showHint = true,
}: QueuedMessageDisplayProps) => {
  if (messageQueue.length === 0) return null;
  const shown = messageQueue.slice(0, MAX_DISPLAYED_QUEUED_MESSAGES);
  const hidden = messageQueue.length - shown.length;
  const more =
    hidden > 0 ? t('… {{count}} more', { count: String(hidden) }) : '';
  // Without the hint, the hidden count still shows: nothing else tells the
  // user that more messages are waiting.
  const hint = showHint ? (
    <Text color={extendedTheme.text.muted}>
      {more && `${more} · `}
      {`${t('{{count}} queued', { count: String(messageQueue.length) })} · `}
      <Text color={theme.text.secondary}>{glyphs().up}</Text>
      {` ${t('edit')}`}
    </Text>
  ) : more ? (
    <Text color={extendedTheme.text.muted}>{more}</Text>
  ) : null;
  return (
    <Box flexDirection="column" width="100%">
      {shown.map((message, index) => (
        <Box key={index} width="100%" justifyContent="space-between">
          <Box flexShrink={1} minWidth={0}>
            <Text color={theme.text.secondary} wrap="truncate">
              <Text
                color={extendedTheme.ui.brand}
              >{`${glyphs().queued} `}</Text>
              {message.replace(/\s+/g, ' ')}
            </Text>
          </Box>
          {hint && index === shown.length - 1 && (
            <Box flexShrink={0} marginLeft={2}>
              {hint}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};
