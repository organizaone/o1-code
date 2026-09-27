/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useContext } from 'react';
import { Box, Text } from 'ink';
import { extendedTheme } from '../semantic-colors.js';
import { t } from '../../i18n/index.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { RespondingSpinner } from './RespondingSpinner.js';
import { formatTurnTime } from './footer-zones.js';
import { useElapsedSeconds, type ElapsedClock } from '../hooks/useTimer.js';

/** The agent's working line at the bottom of the conversation well. */
export const ThinkingLine: React.FC<{
  phrase?: string;
  elapsedSeconds: number;
}> = ({ phrase, elapsedSeconds }) => {
  // `ui.accessibility.enableLoadingPhrases: false` keeps the neutral label.
  const phrasesOff =
    useContext(ConfigContext)?.getAccessibility()?.enableLoadingPhrases ===
    false;
  const label = (!phrasesOff && phrase) || t('thinking…');
  return (
    <Box>
      <Box marginRight={1}>
        <RespondingSpinner />
      </Box>
      <Text color={extendedTheme.text.muted} italic wrap="truncate">
        {`${label} ${formatTurnTime(elapsedSeconds)} · ${t('esc to cancel')}`}
      </Text>
    </Box>
  );
};

/** The thinking line fed by the turn's clock; see LiveLoadingIndicator. */
export const LiveThinkingLine: React.FC<{
  phrase?: string;
  elapsedClock?: ElapsedClock;
}> = ({ phrase, elapsedClock }) => (
  <ThinkingLine
    phrase={phrase}
    elapsedSeconds={useElapsedSeconds(elapsedClock)}
  />
);
