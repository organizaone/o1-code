/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AuthType,
  type Config,
  getErrorMessage,
  logAuth,
  AuthEvent,
} from '@organizaone/o1-code-core';
import { isO1ConnectError } from '@organizaone/o1-code-core/providers/o1-connect/session.js';
import { localizeO1ConnectError } from '../ui/auth/o1-connect-message.js';

/**
 * Handles the initial authentication flow.
 * @param config The application config.
 * @param authType The selected auth type.
 * @returns An error message if authentication fails, otherwise null.
 */
export async function performInitialAuth(
  config: Config,
  authType: AuthType | undefined,
): Promise<string | null> {
  if (!authType) {
    return null;
  }

  try {
    await config.refreshAuth(authType);
    // The console.log is intentionally left out here.
    // We can add a dedicated startup message later if needed.

    // Log authentication success
    const authEvent = new AuthEvent(authType, 'auto', 'success');
    logAuth(config, authEvent);
  } catch (e) {
    // An o1-connect error already says what happened and what to do, in the
    // interface's language.
    const errorMessage = isO1ConnectError(e)
      ? localizeO1ConnectError(e, { stage: 'open' })
      : `Failed to login. Message: ${getErrorMessage(e)}`;

    // Log authentication failure
    const authEvent = new AuthEvent(authType, 'auto', 'error', errorMessage);
    logAuth(config, authEvent);

    return errorMessage;
  }

  return null;
}
