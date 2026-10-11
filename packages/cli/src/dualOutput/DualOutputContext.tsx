/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type { DualOutputSink } from './dual-output-sink.js';

/**
 * React context for the dual output sink.
 * Provides access to the structured JSON event emitter throughout the
 * interactive UI component tree: the `--json-fd`/`--json-file` sidecar, a
 * remote session's mirror, or the fan-out holding both.
 */
export const DualOutputContext = createContext<DualOutputSink | null>(null);

/**
 * Hook to access the dual output sink from any component or hook
 * within the interactive UI.
 *
 * Returns null when nothing can ever listen; a sink that is present but
 * has no consumer right now reports `isConnected: false`.
 */
export function useDualOutput(): DualOutputSink | null {
  return useContext(DualOutputContext);
}
