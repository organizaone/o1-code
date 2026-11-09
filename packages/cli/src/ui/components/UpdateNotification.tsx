/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { extendedTheme, theme } from '../semantic-colors.js';

interface UpdateNotificationProps {
  message: string;
}

/**
 * The transient line above the input while an update is found outside the
 * update dialog. It uses the brand frame of the other update surfaces; an
 * available update is news, not a warning.
 */
export const UpdateNotification = ({ message }: UpdateNotificationProps) => {
  const [headline = '', ...rest] = message.split('\n');
  return (
    <Box
      borderStyle="round"
      borderColor={extendedTheme.ui.brand}
      flexDirection="column"
      paddingX={2}
      marginY={1}
    >
      <Text color={theme.text.primary} bold wrap="wrap">
        {headline}
      </Text>
      {rest.length > 0 && (
        <Text color={extendedTheme.text.muted} wrap="wrap">
          {rest.join('\n')}
        </Text>
      )}
    </Box>
  );
};
