/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from '../../i18n/index.js';
import type {
  RemoteStartOutcome,
  RemoteStatus,
} from '../../remote/remote-controller.js';
import type { RemoteSessionSnapshot } from '../../remote/remote-session.js';
import { CommandKind, type SlashCommand } from './types.js';

/** Where the account page lives; the viewer's URL comes from the gateway. */
export const ORGANIZAONE_ACCOUNT_URL =
  'https://account.organizaone.com/account';

/** One line for the footer and the status: what the remote session is doing. */
export function describeRemoteSnapshot(
  snapshot: RemoteSessionSnapshot,
): string {
  switch (snapshot.state) {
    case 'online':
      return snapshot.viewers === 1
        ? t('remote: active · 1 viewer')
        : t('remote: active · {{count}} viewers', {
            count: String(snapshot.viewers),
          });
    case 'reconnecting':
      return t('remote: reconnecting');
    default:
      return t('remote: ended: {{reason}}', {
        reason: snapshot.reason ?? 'ended',
      });
  }
}

/** What the user reads for each way a start can turn out, except a success. */
export function describeRemoteOutcome(
  outcome: Exclude<RemoteStartOutcome, { status: 'started' | 'active' }>,
): string {
  switch (outcome.status) {
    case 'disabled':
      return t(
        'Remote sessions are off for this session (remote.enabled, or O1CODE_DISABLE_REMOTE).',
      );
    case 'needs-account':
      return t(
        'Remote needs the OrganizaOne sign-in: connect with "Sign in with your account" or the o1-gateway device code (/auth).',
      );
    case 'plan':
      return t(
        'Your plan does not include remote sessions. See your account at {{url}}.',
        { url: ORGANIZAONE_ACCOUNT_URL },
      );
    case 'unavailable':
      return t(
        'The OrganizaOne gateway did not answer about this key. Try again in a moment.',
      );
    case 'tunnel-required':
      return t(
        'remote.viaTunnel is "always", but this session has no o1-connect tunnel open.',
      );
    case 'direct-unavailable':
      return t(
        'remote.viaTunnel is "never", but this session only reaches OrganizaOne through the o1-connect tunnel.',
      );
    case 'refused':
      if (outcome.code === 'limit') {
        return outcome.sessions?.length
          ? t(
              'Your plan allows no more remote sessions at once. Live now: {{sessions}}.',
              { sessions: outcome.sessions.join(', ') },
            )
          : t('Your plan allows no more remote sessions at once.');
      }
      return t(
        'The gateway refused the remote session ({{code}}): {{message}}',
        {
          code: outcome.code,
          message: outcome.message,
        },
      );
    case 'failed':
      return outcome.message;
    default:
      return t('Remote mode could not start.');
  }
}

export function describeRemoteStatus(status: RemoteStatus): string {
  if (status.active && status.snapshot) {
    return [
      describeRemoteSnapshot(status.snapshot),
      t('Name: {{name}}', { name: status.name }),
      ...(status.url ? [t('Open: {{url}}', { url: status.url })] : []),
      t('/rc off ends it.'),
    ].join('\n');
  }
  const lines = [t('Remote mode is off.')];
  if (status.last?.reason && status.last.reason !== 'closed') {
    lines.push(describeRemoteSnapshot(status.last));
  }
  lines.push(t('/rc turns it on.'));
  return lines.join('\n');
}

export const rcCommand: SlashCommand = {
  name: 'rc',
  altNames: ['remote-control'],
  get description() {
    return t(
      'Mirror this session to your OrganizaOne account page and take input from there',
    );
  },
  get argumentHint() {
    return t('[off | status | name <name>]');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'],
  action: async (context, args) => {
    const remote = context.services.remote;
    if (!remote) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Remote sessions are not available in this session.'),
      };
    }
    const trimmed = (args ?? '').trim();
    const [verb, ...rest] = trimmed.split(/\s+/);
    if (!trimmed) return { type: 'dialog', dialog: 'remote' };
    switch (verb) {
      case 'off': {
        if (!remote.status().active) {
          await remote.stop();
          return {
            type: 'message',
            messageType: 'info',
            content: t('Remote mode is not on.'),
          };
        }
        await remote.stop();
        return {
          type: 'message',
          messageType: 'info',
          content: t(
            'Remote mode is off; the session ended on the account page.',
          ),
        };
      }
      case 'status':
        return {
          type: 'message',
          messageType: 'info',
          content: describeRemoteStatus(remote.status()),
        };
      case 'name': {
        const name = rest.join(' ').trim();
        if (!name) {
          return {
            type: 'message',
            messageType: 'error',
            content: t('Usage: /rc name <name>'),
          };
        }
        const outcome = await remote.rename(name);
        if (outcome.status === 'started' || outcome.status === 'active') {
          return {
            type: 'message',
            messageType: 'info',
            content: t('Remote session renamed to {{name}}.', { name }),
          };
        }
        return {
          type: 'message',
          messageType: 'error',
          content: describeRemoteOutcome(outcome),
        };
      }
      default:
        return {
          type: 'message',
          messageType: 'error',
          content: t('Usage: /rc [off | status | name <name>]'),
        };
    }
  },
};
