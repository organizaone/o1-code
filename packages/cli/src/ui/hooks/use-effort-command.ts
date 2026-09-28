/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import type { LoadedSettings } from '../../config/settings.js';
import { MessageType, type HistoryItemWithoutId } from '../types.js';
import {
  applyEffortSelection,
  type EffortSelection,
} from '../commands/effort-utils.js';

interface UseEffortCommandReturn {
  isEffortDialogOpen: boolean;
  openEffortDialog: () => void;
  handleEffortSelect: (selection: EffortSelection | undefined) => void;
}

export const useEffortCommand = (
  loadedSettings: LoadedSettings,
  config: Config,
  addItem?: (item: HistoryItemWithoutId, baseTimestamp: number) => void,
): UseEffortCommandReturn => {
  const [isEffortDialogOpen, setIsEffortDialogOpen] = useState(false);

  const openEffortDialog = useCallback(() => {
    setIsEffortDialogOpen(true);
  }, []);

  const handleEffortSelect = useCallback(
    (selection: EffortSelection | undefined) => {
      try {
        if (!selection) {
          // User cancelled the dialog — leave the current effort unchanged.
          return;
        }
        // Applies at runtime (next turn) and persists for future sessions;
        // provider adapters clamp a tier to what the active model supports.
        const text = applyEffortSelection(config, loadedSettings, selection);
        if (addItem) {
          const feedbackItem: HistoryItemWithoutId & Record<string, unknown> = {
            type: MessageType.INFO,
            text,
          };
          addItem(feedbackItem, Date.now());
          config.getChatRecordingService?.()?.recordSlashCommand({
            phase: 'result',
            rawCommand: '/effort',
            outputHistoryItems: [feedbackItem],
          });
        }
      } finally {
        setIsEffortDialogOpen(false);
      }
    },
    [config, loadedSettings, addItem],
  );

  return {
    isEffortDialogOpen,
    openEffortDialog,
    handleEffortSelect,
  };
};
