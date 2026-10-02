/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApprovalMode,
  APPROVAL_MODES,
} from '@organizaone/o1-code-core/config/approval-mode.js';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import type { SessionApprovalModeRecordPayload } from '@organizaone/o1-code-core/services/chatRecordingService.js';
import type { SessionRestoreProjection } from '@organizaone/o1-code-core/services/session-transcript-reader.js';
import { createDebugLogger } from '@organizaone/o1-code-core/utils/debugLogger.js';

const debugLogger = createDebugLogger('SESSION_APPROVAL_MODE');

function asApprovalMode(value: unknown): ApprovalMode | undefined {
  return typeof value === 'string' &&
    APPROVAL_MODES.includes(value as ApprovalMode)
    ? (value as ApprovalMode)
    : undefined;
}

/**
 * Records the mode a daemon session is in, so a cold restore brings it back.
 * In Plan the chosen execution mode travels along, so leaving Plan after a
 * restore returns to the mode the user picked.
 */
export async function recordDaemonSessionApprovalModeFromConfig(
  config: Config,
): Promise<void> {
  const recording = config.getChatRecordingService?.();
  if (!recording?.recordSessionApprovalMode) return;
  const mode = config.getApprovalMode();
  const planExecutionMode =
    mode === ApprovalMode.PLAN ? config.getPlanExecutionMode?.() : undefined;
  const payload: SessionApprovalModeRecordPayload = {
    mode,
    ...(planExecutionMode && planExecutionMode !== ApprovalMode.PLAN
      ? { planExecutionMode }
      : {}),
  };
  try {
    await recording.recordSessionApprovalMode(payload);
  } catch (error) {
    debugLogger.debug('recordSessionApprovalMode failed', error);
  }
}

/**
 * Applies the recorded mode to a restored session. An explicit mode in the
 * restore request is applied by the daemon afterwards and wins. A mode the
 * session cannot take (an untrusted folder refusing a privileged mode) is
 * logged and skipped: the session keeps the mode it already has.
 */
export function applyRestoredSessionApprovalMode(
  config: Config,
  projection: SessionRestoreProjection | undefined,
): void {
  const recorded = projection?.runtime.recording.sessionApprovalMode;
  const mode = asApprovalMode(recorded?.mode);
  if (!mode) return;
  const planExecutionMode = asApprovalMode(recorded?.planExecutionMode);
  if (
    config.getApprovalMode() === mode &&
    (mode !== ApprovalMode.PLAN ||
      planExecutionMode === undefined ||
      config.getPlanExecutionMode?.() === planExecutionMode)
  ) {
    return;
  }
  try {
    if (
      mode === ApprovalMode.PLAN &&
      planExecutionMode !== undefined &&
      planExecutionMode !== ApprovalMode.PLAN
    ) {
      config.setPlanMode(true, planExecutionMode);
    } else {
      config.setApprovalMode(mode);
    }
  } catch (error) {
    debugLogger.warn(
      `restore session approval mode (${mode}) skipped: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
