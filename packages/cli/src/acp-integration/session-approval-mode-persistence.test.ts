/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { ApprovalMode } from '@organizaone/o1-code-core';
import type {
  Config,
  SessionRestoreProjection,
} from '@organizaone/o1-code-core';
import {
  applyRestoredSessionApprovalMode,
  recordDaemonSessionApprovalModeFromConfig,
} from './session-approval-mode-persistence.js';

function recordingProjection(
  recording: SessionRestoreProjection['runtime']['recording'],
): SessionRestoreProjection {
  return {
    sessionId: 'session-1',
    filePath: '/tmp/session.jsonl',
    startTime: '2026-01-01T00:00:00.000Z',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    runtime: {
      apiHistory: [],
      uiTelemetryEvents: [],
      recording,
      goalRecords: [],
      initialTurn: 0,
      backgroundNotificationTaskIds: [],
    },
  };
}

function fakeConfig(current: ApprovalMode, planExecution?: ApprovalMode) {
  const recordSessionApprovalMode = vi.fn().mockResolvedValue(true);
  const config = {
    getApprovalMode: () => current,
    getPlanExecutionMode: () => planExecution,
    setApprovalMode: vi.fn(),
    setPlanMode: vi.fn(),
    getChatRecordingService: () => ({ recordSessionApprovalMode }),
  };
  return {
    config: config as unknown as Config,
    config_: config,
    recordSessionApprovalMode,
  };
}

describe('recordDaemonSessionApprovalModeFromConfig', () => {
  it('records the current mode of the session', async () => {
    const { config, recordSessionApprovalMode } = fakeConfig(
      ApprovalMode.AUTO_EDIT,
    );
    await recordDaemonSessionApprovalModeFromConfig(config);
    expect(recordSessionApprovalMode).toHaveBeenCalledWith({
      mode: 'auto-edit',
    });
  });

  it('records the execution mode chosen for Plan', async () => {
    const { config, recordSessionApprovalMode } = fakeConfig(
      ApprovalMode.PLAN,
      ApprovalMode.AUTO,
    );
    await recordDaemonSessionApprovalModeFromConfig(config);
    expect(recordSessionApprovalMode).toHaveBeenCalledWith({
      mode: 'plan',
      planExecutionMode: 'auto',
    });
  });

  it('does not throw when recording fails', async () => {
    const { config, recordSessionApprovalMode } = fakeConfig(
      ApprovalMode.DEFAULT,
    );
    recordSessionApprovalMode.mockRejectedValue(new Error('disk full'));
    await expect(
      recordDaemonSessionApprovalModeFromConfig(config),
    ).resolves.toBeUndefined();
  });
});

describe('applyRestoredSessionApprovalMode', () => {
  it('applies the recorded mode to a restored session', () => {
    const { config, config_ } = fakeConfig(ApprovalMode.DEFAULT);
    applyRestoredSessionApprovalMode(
      config,
      recordingProjection({
        lastCompletedUuid: 'u1',
        turnParentUuids: [null],
        sessionApprovalMode: { mode: 'yolo' },
      }),
    );
    expect(config_.setApprovalMode).toHaveBeenCalledWith(ApprovalMode.YOLO);
    expect(config_.setPlanMode).not.toHaveBeenCalled();
  });

  it('restores Plan together with its execution mode', () => {
    const { config, config_ } = fakeConfig(ApprovalMode.DEFAULT);
    applyRestoredSessionApprovalMode(
      config,
      recordingProjection({
        lastCompletedUuid: 'u1',
        turnParentUuids: [null],
        sessionApprovalMode: { mode: 'plan', planExecutionMode: 'auto-edit' },
      }),
    );
    expect(config_.setPlanMode).toHaveBeenCalledWith(
      true,
      ApprovalMode.AUTO_EDIT,
    );
  });

  it('leaves the session alone without a record or when it already matches', () => {
    const none = fakeConfig(ApprovalMode.DEFAULT);
    applyRestoredSessionApprovalMode(
      none.config,
      recordingProjection({ lastCompletedUuid: 'u1', turnParentUuids: [null] }),
    );
    expect(none.config_.setApprovalMode).not.toHaveBeenCalled();

    const same = fakeConfig(ApprovalMode.AUTO);
    applyRestoredSessionApprovalMode(
      same.config,
      recordingProjection({
        lastCompletedUuid: 'u1',
        turnParentUuids: [null],
        sessionApprovalMode: { mode: 'auto' },
      }),
    );
    expect(same.config_.setApprovalMode).not.toHaveBeenCalled();
  });

  it('ignores a mode the session cannot take', () => {
    // An untrusted folder refuses privileged modes with a TrustGateError:
    // the restore proceeds in the mode the session already has.
    const { config, config_ } = fakeConfig(ApprovalMode.DEFAULT);
    config_.setApprovalMode.mockImplementation(() => {
      throw Object.assign(new Error('untrusted'), { name: 'TrustGateError' });
    });
    expect(() =>
      applyRestoredSessionApprovalMode(
        config,
        recordingProjection({
          lastCompletedUuid: 'u1',
          turnParentUuids: [null],
          sessionApprovalMode: { mode: 'yolo' },
        }),
      ),
    ).not.toThrow();
  });
});
