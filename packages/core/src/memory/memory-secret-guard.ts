/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugLogger } from '../utils/debugLogger.js';
import { isManagedMemoryPath, isTeamAutoMemPath } from './paths.js';
import { scanForSecrets } from './secret-scanner.js';

const debugLogger = createDebugLogger('MEMORY_SECRET_GUARD');

/**
 * Guards writes to managed memory against storing credentials. Every tier is
 * covered: project and user memory are loaded into future prompts and sent to
 * the model on every recall, and team memory is also committed to the repo
 * and shared with every collaborator. A write that targets any memory
 * directory and contains a detected secret is rejected — unconditionally,
 * even if the tier is otherwise disabled.
 *
 * Returns an error message to block the write, or null to allow it. The path
 * check runs first, so non-memory writes never pay for a scan.
 */
export function checkMemorySecrets(
  filePath: string,
  content: string,
  projectRoot: string,
): string | null {
  if (!isManagedMemoryPath(filePath, projectRoot)) {
    return null;
  }
  const matches = scanForSecrets(content);
  if (matches.length === 0) {
    return null;
  }
  // Rule IDs only — never the matched content, which is the secret itself.
  debugLogger.debug(
    `Blocked memory write; matched rules: ${matches
      .map((m) => m.ruleId)
      .join(', ')}`,
  );
  const labels = matches.map((m) => m.label).join(', ');
  const reason = isTeamAutoMemPath(filePath, projectRoot)
    ? 'Team memory is shared with all repository collaborators.'
    : 'Memory is sent to the model in future sessions.';
  return (
    `Content contains potential secrets (${labels}) and cannot be written to ` +
    `memory. ${reason} Remove the sensitive content and try again.`
  );
}
