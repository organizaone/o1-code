/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionService } from '@organizaone/o1-code-core/services/sessionService.js';
import type { SessionListItem } from '@organizaone/o1-code-core/services/sessionService.js';

/** Read past empty sessions to find a few worth listing on the start screen. */
const SESSIONS_TO_READ = 12;

const cache = new Map<string, SessionListItem[]>();

/**
 * Reads the project's recent sessions once, before the UI renders, so the
 * start screen has them on its first render. Without virtualized history that
 * screen sits in Ink's <Static>, which renders it once and never again.
 * A failure caches an empty list: the start screen then shows no sessions.
 */
export async function primeRecentSessions(cwd: string): Promise<void> {
  if (cache.has(cwd)) return;
  try {
    const result = await new SessionService(cwd).listSessions({
      size: SESSIONS_TO_READ,
    });
    cache.set(cwd, result.items);
  } catch {
    cache.set(cwd, []);
  }
}

/** The sessions primed for `cwd`, or undefined when none were read yet. */
export function getRecentSessions(cwd: string): SessionListItem[] | undefined {
  return cache.get(cwd);
}

/** Test-only: set the primed sessions for a directory. */
export function primeRecentSessionsForTest(
  cwd: string,
  sessions: SessionListItem[],
): void {
  cache.set(cwd, sessions);
}
