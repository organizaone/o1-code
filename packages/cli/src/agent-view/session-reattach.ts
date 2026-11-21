/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

const listeners = new Set<() => void>();

export function onAgentSessionReattach(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAgentSessionReattach(): void {
  for (const listener of listeners) listener();
}
