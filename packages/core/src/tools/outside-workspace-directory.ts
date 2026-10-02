/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { Config } from '../config/config.js';
import { realpathNearestExisting } from '../utils/paths.js';

/**
 * Whether a shell or monitor `directory` falls outside every workspace
 * directory. Such a call is a permission question, not a parameter error: the
 * user approves it (Full Access runs it), as with a read outside the workspace.
 */
export function isOutsideWorkspaceDirectory(
  config: Config,
  directory: string | undefined,
): boolean {
  if (!directory) return false;
  return !config.getWorkspaceContext().isPathWithinWorkspace(directory);
}

/**
 * The confirmation warning for a command run outside the workspace. When the
 * directory is a link, the warning names where it really points, since that
 * is where the command runs.
 */
export function outsideWorkspaceDirectoryWarning(directory: string): string {
  // Named as the call gave it (validation already requires an absolute
  // path); the resolved form only serves to tell a link from its target.
  const resolved = path.resolve(directory);
  let real = resolved;
  try {
    real = realpathNearestExisting(resolved);
  } catch {
    // Unreadable or missing: name what was asked for.
  }
  const target =
    real !== resolved
      ? `'${directory}' (a link to '${real}')`
      : `'${directory}'`;
  return `This command runs outside the workspace, in ${target}.`;
}
