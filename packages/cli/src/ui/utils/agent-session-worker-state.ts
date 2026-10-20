/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentViewSessionState } from '../../agent-view/protocol.js';
import { StreamingState } from '../types.js';

export interface AgentSessionWorkerUiState {
  initialized: boolean;
  failed: boolean;
  needsInput: boolean;
  isProcessing: boolean;
  streamingState: StreamingState;
}

export function deriveAgentSessionWorkerState(
  state: AgentSessionWorkerUiState,
): AgentViewSessionState {
  if (state.failed) return 'failed';
  if (!state.initialized) return 'starting';
  if (
    state.needsInput ||
    state.streamingState === StreamingState.WaitingForConfirmation
  ) {
    return 'needs_input';
  }
  if (
    state.isProcessing ||
    state.streamingState === StreamingState.Responding
  ) {
    return 'working';
  }
  return 'idle';
}
