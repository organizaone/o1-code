/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { SettingScope } from '../../config/settings.js';
import { t } from '../../i18n/index.js';
import { useRemoteController } from '../../remote/RemoteControllerContext.js';
import type { RemoteStatus } from '../../remote/remote-controller.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { theme } from '../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import {
  describeRemoteOutcome,
  describeRemoteSnapshot,
} from '../commands/rc-command.js';

type Phase = 'consent' | 'connecting' | 'on' | 'error';

type RemoteAction = 'continue' | 'disconnect';

/**
 * Drops the blank border the QR generator pads in, so the code takes only
 * the rows and columns it needs. Rows inside the code stay: an all-white
 * module row renders as spaces and shifting it would break the pattern.
 */
export function compactQr(code: string): string {
  const lines = code.replace(/\r/g, '').split('\n');
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '')
    lines.pop();
  const inked = lines.filter((line) => line.trim() !== '');
  const indent =
    inked.length === 0
      ? 0
      : Math.min(...inked.map((line) => line.match(/^[ \t]*/)![0].length));
  return lines.map((line) => line.slice(indent).replace(/\s+$/, '')).join('\n');
}

/** The dialog's own rows (title, address, status, actions, border) plus the header and footer. */
const QR_ROW_BUDGET = 14;

/**
 * `/rc`: the one-time notice the first time, then the viewer's address and
 * a QR code while the session is on, or why it could not start.
 */
export const RemoteControlDialog: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const remote = useRemoteController();
  const settings = useSettings();
  const { rows: terminalRows } = useTerminalSize();
  const consented = settings.merged.remote?.consented === true;
  const [status, setStatus] = useState<RemoteStatus | null>(
    () => remote?.status() ?? null,
  );
  const [phase, setPhase] = useState<Phase>(() =>
    remote?.status().active ? 'on' : consented ? 'connecting' : 'consent',
  );
  const [message, setMessage] = useState('');
  const [qr, setQr] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!remote) return;
    setPhase('connecting');
    const outcome = await remote.start();
    setStatus(remote.status());
    if (outcome.status === 'started' || outcome.status === 'active') {
      setPhase('on');
    } else {
      setMessage(describeRemoteOutcome(outcome));
      setPhase('error');
    }
  }, [remote]);

  useEffect(() => {
    if (phase === 'connecting') void start();
    // Only on mount: a later phase change to `connecting` comes from `start`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!remote) return;
    return remote.onEvent(() => {
      const current = remote.status();
      setStatus(current);
      if (!current.active && phase === 'on') {
        setMessage(
          current.last
            ? describeRemoteSnapshot(current.last)
            : t('Remote mode is off.'),
        );
        setPhase('error');
      }
    });
  }, [remote, phase]);

  const url = status?.active ? status.url : undefined;
  useEffect(() => {
    if (!url) {
      setQr(null);
      return;
    }
    let alive = true;
    void import('qrcode-terminal').then(({ default: qrcode }) => {
      qrcode.setErrorLevel('Q');
      qrcode.generate(url, { small: true }, (code: string) => {
        if (alive) setQr(compactQr(code));
      });
    });
    return () => {
      alive = false;
    };
  }, [url]);
  const qrRows = qr ? qr.split('\n').length : 0;
  // A code taller than what is left of the terminal would be clipped by the
  // dialog's height cap mid-pattern, unreadable to a camera; the address is
  // the way in then.
  const showQr =
    qr !== null && qrRows <= Math.max(0, terminalRows - QR_ROW_BUDGET);

  const onAction = useCallback(
    (action: RemoteAction) => {
      if (action === 'disconnect') {
        void remote?.stop().finally(() => onClose());
        return;
      }
      onClose();
    },
    [remote, onClose],
  );
  const actions: Array<RadioSelectItem<RemoteAction>> = [
    { label: t('Continue'), value: 'continue', key: 'continue' },
    {
      label: t('Disconnect remote control'),
      value: 'disconnect',
      key: 'disconnect',
    },
  ];

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
        return;
      }
      if (phase === 'consent' && key.name === 'return') {
        settings.setValue(SettingScope.User, 'remote.consented', true);
        void start();
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingX={1}
    >
      <Text bold color={theme.text.accent}>
        {t('Remote sessions')}
      </Text>
      {phase === 'consent' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            {t(
              'The OrganizaOne gateway will mirror this terminal to your account page: what you type, what the model answers, each tool call and its result, and the questions the terminal asks.',
            )}
          </Text>
          <Text>
            {t(
              'From the page you can type prompts, stop a turn, compact or clear the session, and answer permissions and questions. Shell access, /resume, plugins and the approval mode stay in the terminal.',
            )}
          </Text>
          <Text>
            {t(
              'The gateway relays the session and keeps none of its content; it records that a session existed, who viewed it, and each decision and who answered it.',
            )}
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              {t('Enter to continue · Esc to cancel. Shown once.')}
            </Text>
          </Box>
        </Box>
      )}
      {phase === 'connecting' && (
        <Box marginTop={1}>
          <Text>{t('Connecting to the OrganizaOne gateway…')}</Text>
        </Box>
      )}
      {phase === 'on' && status?.active && (
        <Box flexDirection="column">
          <Text>
            {t(
              'Remote mode is on as "{{name}}". Open this address on your account page, or scan the code:',
              {
                name: status.name,
              },
            )}
          </Text>
          <Text color={theme.text.link}>{status.url}</Text>
          {showQr ? (
            <Text>{qr}</Text>
          ) : (
            qr !== null && (
              <Text color={theme.text.secondary}>
                {t(
                  'The QR code does not fit this terminal; open the address instead.',
                )}
              </Text>
            )
          )}
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              {status.snapshot ? describeRemoteSnapshot(status.snapshot) : ''}
            </Text>
          </Box>
          <Box marginTop={1}>
            <RadioButtonSelect
              items={actions}
              onSelect={onAction}
              showNumbers={false}
            />
          </Box>
        </Box>
      )}
      {phase === 'error' && (
        <Box flexDirection="column">
          <Text color={theme.status.warning}>{message}</Text>
          <Text color={theme.text.secondary}>{t('Esc to close')}</Text>
        </Box>
      )}
    </Box>
  );
};
