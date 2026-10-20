/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { StreamingState } from '../types.js';
import { deriveAgentSessionWorkerState } from './agent-session-worker-state.js';

describe('deriveAgentSessionWorkerState', () => {
  const idle = {
    initialized: true,
    failed: false,
    needsInput: false,
    isProcessing: false,
    streamingState: StreamingState.Idle,
  };

  it('reports startup and idle separately', () => {
    expect(deriveAgentSessionWorkerState({ ...idle, initialized: false })).toBe(
      'starting',
    );
    expect(deriveAgentSessionWorkerState(idle)).toBe('idle');
  });

  it('reports running work and pending human input', () => {
    expect(deriveAgentSessionWorkerState({ ...idle, isProcessing: true })).toBe(
      'working',
    );
    expect(
      deriveAgentSessionWorkerState({
        ...idle,
        streamingState: StreamingState.Responding,
      }),
    ).toBe('working');
    expect(
      deriveAgentSessionWorkerState({
        ...idle,
        streamingState: StreamingState.WaitingForConfirmation,
      }),
    ).toBe('needs_input');
    expect(
      deriveAgentSessionWorkerState({
        ...idle,
        needsInput: true,
        isProcessing: true,
      }),
    ).toBe('needs_input');
  });

  it('keeps an initialization failure visible', () => {
    expect(
      deriveAgentSessionWorkerState({
        ...idle,
        failed: true,
        needsInput: true,
      }),
    ).toBe('failed');
  });
});
