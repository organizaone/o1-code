/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { useThoughtExpanded } from '../contexts/ThoughtExpandedContext.js';

export type DisplayMode = 'detailed' | 'summary';

export const DEFAULT_DISPLAY_MODE: DisplayMode = 'detailed';

export function resolveDisplayMode(value: unknown): DisplayMode {
  return value === 'summary' ? 'summary' : DEFAULT_DISPLAY_MODE;
}

export interface DisplayModeState {
  displayMode: DisplayMode;
  /** Summary rendering applies: the mode is Summary and Ctrl+O is off. */
  summaryActive: boolean;
}

/**
 * The display mode in force. Ctrl+O (full detail) always wins, so the
 * transcript is the Detailed view in both modes. Without a settings provider
 * (isolated component renders) the mode is Detailed.
 */
export function useDisplayMode(): DisplayModeState {
  const settings = useContext(SettingsContext);
  const { allExpanded } = useThoughtExpanded();
  const displayMode = resolveDisplayMode(settings?.merged.ui?.displayMode);
  return {
    displayMode,
    summaryActive: displayMode === 'summary' && !allExpanded,
  };
}
