/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef } from 'react';
import { StreamingState } from '../types.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import { fireNotificationHook } from '@organizaone/o1-code-core/core/toolHookTriggers.js';
import { NotificationType } from '@organizaone/o1-code-core/hooks/types.js';
import type { TerminalNotification } from './useTerminalNotification.js';
import type { TrackedToolCall } from './useReactToolScheduler.js';
import { sendNotification } from '../../services/notificationService.js';
import {
  STOPPED_CLOCK,
  elapsedSecondsAt,
  type ElapsedClock,
} from './useTimer.js';

export const LONG_TASK_NOTIFICATION_THRESHOLD_SECONDS = 20;

const NOTIFICATION_TITLE = 'O1-Code';

// The two accepted values for `general.notificationMode`:
//   - 'all' (default, historical behavior) — fire on every WaitingForConfirmation
//     transition AND on long-task idle.
//   - 'task-complete' — suppress per-approval notifications; only fire on
//     long-task idle. Users driving many tool approvals otherwise get dozens
//     of notifications per task.
// The value read from settings is defensively narrowed at the call site — an
// unknown value falls back to 'all' rather than silently disabling approval
// notifications.
export type NotificationMode = 'all' | 'task-complete';

interface UseAttentionNotificationsOptions {
  isFocused: boolean;
  streamingState: StreamingState;
  elapsedClock: ElapsedClock;
  settings: LoadedSettings;
  config?: Config;
  terminal: TerminalNotification;
  pendingToolCalls?: TrackedToolCall[];
}

export const useAttentionNotifications = ({
  isFocused,
  streamingState,
  elapsedClock,
  settings,
  config,
  terminal,
  pendingToolCalls,
}: UseAttentionNotificationsOptions) => {
  const terminalBellEnabled: boolean =
    (settings?.merged?.general?.terminalBell as boolean) ?? true;
  // Only 'task-complete' suppresses the per-approval notification; any other
  // value (including missing / legacy configs) preserves the historical "all"
  // behavior.
  const notificationMode: NotificationMode =
    (settings?.merged?.general as { notificationMode?: unknown } | undefined)
      ?.notificationMode === 'task-complete'
      ? 'task-complete'
      : 'all';
  const approvalNotificationsEnabled = notificationMode === 'all';

  const awaitingNotificationSentRef = useRef(false);
  const respondingClockRef = useRef<ElapsedClock>(STOPPED_CLOCK);
  const idleNotificationSentRef = useRef(false);

  // Extract the awaiting tool name as a primitive so the effect doesn't
  // re-fire on every render due to pendingToolCalls array identity changes.
  const awaitingToolName = useMemo(() => {
    const awaitingTool = pendingToolCalls?.find(
      (tc) => tc.status === 'awaiting_approval',
    );
    return awaitingTool?.request.name;
  }, [pendingToolCalls]);

  useEffect(() => {
    if (
      streamingState === StreamingState.WaitingForConfirmation &&
      !isFocused &&
      !awaitingNotificationSentRef.current &&
      terminalBellEnabled &&
      approvalNotificationsEnabled
    ) {
      const message = awaitingToolName
        ? `O1-Code needs your permission to use ${awaitingToolName}`
        : 'O1-Code is waiting for your input';

      sendNotification(
        { message, title: NOTIFICATION_TITLE },
        terminal,
        terminalBellEnabled,
      );
      awaitingNotificationSentRef.current = true;
    }

    if (streamingState !== StreamingState.WaitingForConfirmation || isFocused) {
      awaitingNotificationSentRef.current = false;
    }
  }, [
    isFocused,
    streamingState,
    terminalBellEnabled,
    approvalNotificationsEnabled,
    terminal,
    awaitingToolName,
  ]);

  useEffect(() => {
    // Read when the turn ends: the clock is reset by then. It is kept while
    // waiting for an approval too, where it stands stopped, so the wait is
    // not counted as task time.
    if (streamingState !== StreamingState.Idle) {
      respondingClockRef.current = elapsedClock;
    }
    if (streamingState === StreamingState.Responding) {
      idleNotificationSentRef.current = false;
      return;
    }

    if (streamingState === StreamingState.Idle) {
      const wasLongTask =
        elapsedSecondsAt(respondingClockRef.current) >=
        LONG_TASK_NOTIFICATION_THRESHOLD_SECONDS;
      if (wasLongTask && !isFocused && terminalBellEnabled) {
        sendNotification(
          {
            message: 'O1-Code is waiting for your input',
            title: NOTIFICATION_TITLE,
          },
          terminal,
          terminalBellEnabled,
        );
      }
      respondingClockRef.current = STOPPED_CLOCK;

      // Fire idle_prompt notification hook when entering idle state
      if (config && !idleNotificationSentRef.current) {
        const messageBus = config.getMessageBus();
        const hooksEnabled = !config.getDisableAllHooks();
        if (hooksEnabled && messageBus) {
          fireNotificationHook(
            messageBus,
            'O1-Code is waiting for your input',
            NotificationType.IdlePrompt,
            'Waiting for input',
          )
            .then((hookResult) => {
              if (hookResult.terminalSequence) {
                terminal.writeTerminalSequence(hookResult.terminalSequence);
              }
            })
            .catch(() => {
              // Silently ignore errors - fireNotificationHook has internal error handling
            });
        }
        idleNotificationSentRef.current = true;
      }
      return;
    }

    idleNotificationSentRef.current = false;
  }, [
    streamingState,
    elapsedClock,
    isFocused,
    terminalBellEnabled,
    config,
    terminal,
  ]);
};
