/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState } from 'react';
import { Box, Text, type DOMElement } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { SettingScope } from '../../config/settings.js';
import { theme } from '../semantic-colors.js';
import { t } from '../../i18n/index.js';
import { useMouseEvents } from '../hooks/useMouseEvents.js';
import { findElementAtMouseEvent } from '../utils/mouse-hit.js';

export const QuittingDisplay = ({ onExit }: { onExit?: () => void }) => {
  const uiState = useUIState();
  const settings = useSettings();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const exitingRef = useRef(false);
  const containerRef = useRef<DOMElement>(null);
  const checkboxRefs = useRef<Array<DOMElement | null>>([]);
  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();

  useKeypress(
    (key) => {
      if (key.paste || exitingRef.current) return;
      if (key.sequence === ' ' && !key.ctrl && !key.meta) {
        setDontShowAgain((checked) => !checked);
        return;
      }
      if (dontShowAgain) {
        try {
          settings.setValue(
            SettingScope.User,
            'ui.showSessionSummary',
            false,
            undefined,
            { throwOnWriteFailure: true },
          );
        } catch {
          setSaveError(true);
          setDontShowAgain(false);
          return;
        }
      }
      exitingRef.current = true;
      onExit?.();
    },
    { isActive: !!uiState.quittingMessages },
  );

  useMouseEvents(
    (event) => {
      if (event.name !== 'left-press' || exitingRef.current) return;
      if (
        findElementAtMouseEvent(
          containerRef.current,
          checkboxRefs.current,
          event,
          terminalHeight,
          'rect',
        ) === 0
      ) {
        setDontShowAgain((checked) => !checked);
      }
    },
    { isActive: !!uiState.quittingMessages, tracking: 'button' },
  );

  const availableTerminalHeight = terminalHeight;
  const { mainAreaWidth } = uiState;

  if (!uiState.quittingMessages) {
    return null;
  }

  return (
    <Box ref={containerRef} flexDirection="column" marginBottom={1}>
      {uiState.quittingMessages.map((item) => (
        <HistoryItemDisplay
          key={item.id}
          availableTerminalHeight={
            uiState.constrainHeight ? availableTerminalHeight : undefined
          }
          terminalWidth={terminalWidth}
          mainAreaWidth={mainAreaWidth}
          item={item}
          isPending={false}
        />
      ))}
      <Box
        marginTop={1}
        ref={(element) => {
          checkboxRefs.current[0] = element;
        }}
      >
        <Text color={theme.text.primary}>
          {dontShowAgain ? '[x]' : '[ ]'} {t('Do not show again')}
        </Text>
      </Box>
      <Text color={theme.text.secondary}>
        {t('Press Space to toggle; any other key to exit.')}
      </Text>
      {saveError && (
        <Text color={theme.status.error}>
          {t(
            'Could not save your preference. Press any key to exit without saving.',
          )}
        </Text>
      )}
    </Box>
  );
};
