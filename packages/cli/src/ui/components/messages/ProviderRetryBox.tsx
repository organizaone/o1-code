/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { extendedTheme, theme } from '../../semantic-colors.js';
import { glyphs } from '../../glyphs.js';
import { t } from '../../../i18n/index.js';
import { Spinner } from '../RespondingSpinner.js';

export interface ProviderRetryState {
  message: string;
  remainingSec: number;
  attempt: number;
  maxRetries: number;
}

/**
 * A provider error that will be retried: a red frame with the reason and a
 * live countdown, then "Retrying…" with a spinner (spec §6.5).
 */
export const ProviderRetryBox: React.FC<{ retry: ProviderRetryState }> = ({
  retry,
}) => (
  <Box
    flexDirection="column"
    borderStyle={glyphs().borderStyle}
    borderColor={theme.status.error}
    paddingX={1}
  >
    <Text color={theme.status.error} wrap="wrap">
      {retry.message}
    </Text>
    {retry.remainingSec > 0 ? (
      <Text color={extendedTheme.text.muted}>
        {t('Retrying in {{seconds}}s — esc to give up', {
          seconds: String(retry.remainingSec),
        })}
        {`  (${retry.attempt}/${retry.maxRetries})`}
      </Text>
    ) : (
      <Box>
        <Box marginRight={1}>
          <Spinner color={theme.status.error} />
        </Box>
        <Text color={extendedTheme.text.muted}>{t('Retrying…')}</Text>
      </Box>
    )}
  </Box>
);
