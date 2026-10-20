/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { requestAgentSessionDashboard } from '../../agent-view/worker-sideband.js';
import { t } from '../../i18n/index.js';
import { subagentsCommand } from './subagents-command.js';

export const agentsCommand: SlashCommand = {
  name: 'agents',
  altNames: ['sessions'],
  subCommands: subagentsCommand.subCommands,
  get description() {
    return t('Browse and switch agent sessions.');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async () => {
    try {
      if (await requestAgentSessionDashboard()) {
        return {
          type: 'message',
          messageType: 'info',
          content: t('Opening agent sessions…'),
        } as const;
      }
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Could not open agent sessions: {{error}}', {
          error: error instanceof Error ? error.message : String(error),
        }),
      } as const;
    }
    return {
      type: 'message',
      messageType: 'error',
      content: t('Session switching is unavailable in this terminal.'),
    } as const;
  },
};
