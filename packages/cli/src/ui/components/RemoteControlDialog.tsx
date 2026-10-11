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
import { theme } from '../semantic-colors.js';
import {
  describeRemoteOutcome,
  describeRemoteSnapshot,
} from '../commands/rc-command.js';

type Phase = 'consent' | 'connecting' | 'on' | 'error';

/**
 * `/rc`: the one-time notice the first time, then the viewer's address and
 * a QR code while the session is on, or why it could not start.
 */
export const RemoteControlDialog: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const remote = useRemoteController();
  const settings = useSettings();
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
        if (alive) setQr(code.trimEnd());
      });
    });
    return () => {
      alive = false;
    };
  }, [url]);

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
        <Box flexDirection="column" marginTop={1}>
          <Text>
            {t(
              'Remote mode is on as "{{name}}". Open this address on your account page, or scan the code:',
              {
                name: status.name,
              },
            )}
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.link}>{status.url}</Text>
          </Box>
          {qr && (
            <Box marginTop={1}>
              <Text>{qr}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              {status.snapshot ? describeRemoteSnapshot(status.snapshot) : ''}
              {' · '}
              {t('Esc closes this; /rc off ends the session.')}
            </Text>
          </Box>
        </Box>
      )}
      {phase === 'error' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.status.warning}>{message}</Text>
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>{t('Esc to close')}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
