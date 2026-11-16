/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorMessage } from '@organizaone/o1-code-core/utils/errors.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';
import { t } from '../../i18n/index.js';
import {
  canSignOut,
  describeActiveLogin,
  formatSignOutPrompt,
  signOut,
} from '../auth/sign-out.js';

/**
 * Signs out of the provider the session is connected to, after a
 * confirmation that names the account. The sign-in dialog takes over once
 * the saved key is gone, as it does on a first run.
 */
export const logoutCommand: SlashCommand = {
  name: 'logout',
  altNames: ['disconnect'],
  get description() {
    return t('Sign out of the connected provider');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'],
  action: async (context): Promise<SlashCommandActionReturn> => {
    const { config, settings } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Configuration not available.'),
      };
    }

    const login = describeActiveLogin(config);
    if (!login) {
      return {
        type: 'message',
        messageType: 'info',
        content: t('No provider is connected. Use /auth to connect one.'),
      };
    }
    if (login.externalEnvKey) {
      return {
        type: 'message',
        messageType: 'info',
        content: t(
          'This session reads its key from the environment variable {{envKey}}, set outside O1-Code. Unset it to sign out of {{provider}}.',
          { envKey: login.externalEnvKey, provider: login.provider },
        ),
      };
    }
    if (!canSignOut(login)) {
      return {
        type: 'message',
        messageType: 'info',
        content: t(
          'O1-Code holds no saved key for {{provider}}, so there is nothing to sign out of.',
          { provider: login.provider },
        ),
      };
    }

    if (!context.overwriteConfirmed) {
      return {
        type: 'confirm_action',
        prompt: formatSignOutPrompt(login),
        confirmLabel: t('Sign out'),
        cancelLabel: t('Cancel'),
        defaultDeny: true,
        originalInvocation: { raw: context.invocation?.raw || '/logout' },
      };
    }

    try {
      await signOut(login, { config, settings });
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Could not sign out: {{message}}', {
          message: getErrorMessage(error),
        }),
      };
    }
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: t(
          'Signed out of {{provider}}. The saved key was removed from this machine.',
          { provider: login.provider },
        ),
      },
      Date.now(),
    );
    return { type: 'dialog', dialog: 'auth' };
  },
};
