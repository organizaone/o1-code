/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const keepOpen = settings.merged.ui?.keepSessionSummaryOpen === true;
  const configuredTimeout = settings.merged.ui?.sessionSummaryTimeoutSeconds;
  const timeout =
    typeof configuredTimeout === 'number' &&
    Number.isFinite(configuredTimeout) &&
    configuredTimeout >= 1
      ? configuredTimeout
      : 5;
  const [preference, setPreference] = useState<'keep' | 'hide' | null>(
    keepOpen ? 'keep' : null,
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [paused, setPaused] = useState(keepOpen);
  const pausedRef = useRef(keepOpen);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(timeout));
  const [saveError, setSaveError] = useState(false);
  const exitingRef = useRef(false);
  const containerRef = useRef<DOMElement>(null);
  const checkboxRefs = useRef<Array<DOMElement | null>>([]);
  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  const finishExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    exitRef.current?.();
  }, []);
  const hasSummary = !!uiState.quittingMessages;

  const pauseCountdown = () => {
    pausedRef.current = true;
    setPaused(true);
  };

  useEffect(() => {
    if (!hasSummary || paused) return;
    const deadline = Date.now() + timeout * 1000;
    const timer = setInterval(() => {
      if (pausedRef.current || exitingRef.current) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) finishExit();
    }, 100);
    return () => clearInterval(timer);
  }, [hasSummary, paused, timeout, finishExit]);

  const togglePreference = (index: number) => {
    pauseCountdown();
    setSaveError(false);
    const next = index === 0 ? 'keep' : 'hide';
    setPreference((previous) => (previous === next ? null : next));
  };

  useKeypress(
    (key) => {
      if (key.paste || exitingRef.current) return;
      const wasPaused = pausedRef.current;
      pauseCountdown();
      if (key.name === 'up' || key.name === 'down' || key.name === 'tab') {
        setSelectedIndex((index) => 1 - index);
        return;
      }
      if (key.sequence === ' ' && !key.ctrl && !key.meta) {
        togglePreference(selectedIndex);
        return;
      }
      if (!wasPaused || key.name !== 'return') return;
      if (!saveError && (preference !== null || keepOpen)) {
        try {
          settings.setValues([
            {
              scope: SettingScope.User,
              key: 'ui.showSessionSummary',
              value: preference !== 'hide',
            },
            {
              scope: SettingScope.User,
              key: 'ui.keepSessionSummaryOpen',
              value: preference === 'keep',
            },
          ]);
        } catch {
          setSaveError(true);
          setPreference(null);
          return;
        }
      }
      finishExit();
    },
    { isActive: !!uiState.quittingMessages },
  );

  useMouseEvents(
    (event) => {
      if (event.name !== 'left-press' || exitingRef.current) return;
      const index = findElementAtMouseEvent(
        containerRef.current,
        checkboxRefs.current,
        event,
        terminalHeight,
        'rect',
      );
      if (index !== null && index >= 0) {
        setSelectedIndex(index);
        togglePreference(index);
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
      <Box flexDirection="column" marginTop={1}>
        {(['keep', 'hide'] as const).map((value, index) => (
          <Box
            key={value}
            ref={(element) => {
              checkboxRefs.current[index] = element;
            }}
          >
            <Text
              color={
                selectedIndex === index ? theme.text.accent : theme.text.primary
              }
            >
              {selectedIndex === index ? '❯ ' : '  '}
              {preference === value ? '[x]' : '[ ]'}{' '}
              {value === 'keep'
                ? t('Always keep the exit summary open')
                : t('Do not show again')}
            </Text>
          </Box>
        ))}
      </Box>
      <Text color={theme.text.secondary}>
        {paused
          ? t('↑/↓ select · Space toggle · Enter confirm and exit')
          : t(
              'Closing in {{seconds}}s · press any key to keep this summary open',
              { seconds: String(secondsLeft) },
            )}
      </Text>
      {saveError && (
        <Text color={theme.status.error}>
          {t(
            'Could not save your preference. Press Enter to exit without saving.',
          )}
        </Text>
      )}
    </Box>
  );
};
