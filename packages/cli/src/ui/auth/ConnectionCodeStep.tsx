/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useContext, useEffect, useRef, useState } from 'react';
import fs from 'node:fs';
import { Box, Text } from 'ink';
import { AuthType } from '@organizaone/o1-code-core/core/contentGenerator.js';
import {
  checkProviderKey,
  type ProviderKeyCheck,
  type ProviderProtocol,
} from '@organizaone/o1-code-core/providers/model-discovery.js';
import type { ProviderConfig } from '@organizaone/o1-code-core/providers/types.js';
import {
  describeO1ConnectError,
  forgetO1Connect,
  o1ConnectBaseUrlFor,
  openO1Connect,
  setAsideUnreadableSecretStore,
  setupO1Connect,
  type SetupInfo,
} from '@organizaone/o1-code-core/providers/o1-connect/session.js';
import { Spinner } from '../components/RespondingSpinner.js';
import { TextInput } from '../components/shared/TextInput.js';
import { AppContext } from '../contexts/AppContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { t } from '../../i18n/index.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { maskKey } from './mask-key.js';
import type { ProviderSetupFlow } from './useProviderSetupFlow.js';

type Phase =
  | { kind: 'input' }
  | {
      kind: 'confirm';
      fingerprints: string[];
      info: SetupInfo;
      answer: (confirmed: boolean) => void;
    }
  | { kind: 'opening' }
  | {
      kind: 'unreadable';
      message: string;
      filePath: string;
      retry: () => void;
    }
  | { kind: 'error'; message: string };

const CODE_PREFIX = 'o1gw1.';

function protocolOf(authType: AuthType): ProviderProtocol {
  if (authType === AuthType.USE_ANTHROPIC) return 'anthropic';
  if (authType === AuthType.USE_GEMINI) return 'gemini';
  return 'openai';
}

/** The code itself, or the code read from a kit's `o1-connect.code` file. */
function readCode(input: string): { code: string; kitFile?: string } {
  const trimmed = input.trim();
  if (trimmed.startsWith(CODE_PREFIX)) return { code: trimmed };
  try {
    if (fs.existsSync(trimmed) && fs.statSync(trimmed).isFile()) {
      return {
        code: fs.readFileSync(trimmed, 'utf8').trim(),
        kitFile: trimmed,
      };
    }
  } catch {
    // Not a readable path: treat the text as the code and let setup refuse it.
  }
  return { code: trimmed };
}

/**
 * "o1-gateway device code" (contract §3.4): reads the connection code (or
 * the kit's `o1-connect.code`), shows every fingerprint the code pins and
 * asks for an explicit yes, saves the configuration, then opens the tunnel
 * once to list the models through it. The device token never leaves the
 * library's store; the kit file is deleted once its code is saved.
 */
export function ConnectionCodeStep({
  config,
  flow,
}: {
  config: ProviderConfig;
  flow: ProviderSetupFlow;
}): React.JSX.Element {
  const clientVersion = useContext(AppContext)?.version;
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const [code, setCode] = useState('');
  const [answer, setAnswer] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  // The fingerprints already confirmed for this code, so a retry after the
  // secret store was set aside does not ask for them a second time.
  const confirmedRef = useRef<string | null>(null);
  const flowRef = useRef(flow);
  flowRef.current = flow;

  useEffect(() => () => controllerRef.current?.abort(), []);

  const fail = (error: unknown, retry: () => void) => {
    const described = describeO1ConnectError(error);
    if (described.forgetAndSetUpAgain) {
      void forgetO1Connect().catch(() => undefined);
    }
    if (described.unreadableSecretFile) {
      setAnswer('');
      setPhase({
        kind: 'unreadable',
        message: described.message,
        filePath: described.unreadableSecretFile,
        retry,
      });
      return;
    }
    setPhase({ kind: 'error', message: described.message });
  };

  const start = (connectionCode: string, kitFile: string | undefined) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    const baseUrl = flowRef.current.state.baseUrl;
    const authType = flowRef.current.state.protocol;
    const run = async () => {
      await setupO1Connect(connectionCode, {
        onFingerprint: (fingerprints, info) => {
          const key = fingerprints.join('\n');
          if (confirmedRef.current === key) return true;
          return new Promise<boolean>((resolve) => {
            setPhase({
              kind: 'confirm',
              fingerprints,
              info,
              answer: (confirmed) => {
                if (confirmed) confirmedRef.current = key;
                resolve(confirmed);
              },
            });
          });
        },
      });
      if (signal.aborted) return;
      if (kitFile) {
        try {
          fs.rmSync(kitFile, { force: true });
        } catch {
          // The code is saved; a kit file that stays behind is the user's.
        }
      }
      setPhase({ kind: 'opening' });
      const session = await openO1Connect();
      let check: ProviderKeyCheck | undefined;
      try {
        if (signal.aborted) return;
        check = await checkProviderKey({
          protocol: protocolOf(authType),
          baseUrl: o1ConnectBaseUrlFor(session, authType),
          apiKey: session.apiKey,
          staticModels: config.models ?? [],
          signal,
          clientVersion,
        });
      } finally {
        await session.close().catch(() => undefined);
      }
      if (signal.aborted) return;
      // `baseUrl` stays the proxy's: the session reopens the tunnel itself.
      void baseUrl;
      flowRef.current.submitConnection(
        check.status === 'rejected' ? undefined : check,
      );
    };
    void run().catch((error: unknown) => {
      if (!signal.aborted) fail(error, () => start(connectionCode, kitFile));
    });
  };

  const submitCode = (value: string) => {
    if (phase.kind !== 'input') return;
    const { code: connectionCode, kitFile } = readCode(value);
    if (!connectionCode) return;
    confirmedRef.current = null;
    start(connectionCode, kitFile);
  };

  const submitAnswer = (value: string) => {
    if (phase.kind !== 'confirm') return;
    // Anything but yes saves nothing: the library then fails the setup with
    // `fingerprint_rejected`, which the error phase explains.
    phase.answer(value.trim().toLowerCase() === 'yes');
  };

  const submitReplace = (value: string) => {
    if (phase.kind !== 'unreadable') return;
    if (value.trim().toLowerCase() !== 'replace') {
      setPhase({
        kind: 'error',
        message: t('Nothing was moved: the secret store was left as it was.'),
      });
      return;
    }
    const { filePath, retry } = phase;
    setPhase({ kind: 'opening' });
    void setAsideUnreadableSecretStore(filePath).then(retry, (error: unknown) =>
      setPhase({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (phase.kind === 'confirm') phase.answer(false);
        controllerRef.current?.abort();
        flowRef.current.goBack();
        return;
      }
      if (key.name === 'return' && phase.kind === 'error') {
        setAnswer('');
        setPhase({ kind: 'input' });
      }
    },
    { isActive: phase.kind === 'error' || phase.kind === 'opening' },
  );

  return (
    <Box marginTop={1} flexDirection="column">
      {phase.kind === 'input' && (
        <>
          <Text color={extendedTheme.text.muted}>
            {t(
              'Paste the connection code from the OrganizaOne console, or the path to a kit’s o1-connect.code:',
            )}
          </Text>
          <Box marginTop={1}>
            <TextInput
              key="connection-code-input"
              value={code}
              onChange={setCode}
              onSubmit={submitCode}
              placeholder="o1gw1.…"
              mask={maskKey}
              isActive
            />
          </Box>
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted}>
              {t('enter continue · esc back')}
            </Text>
          </Box>
        </>
      )}
      {phase.kind === 'confirm' && (
        <>
          <Text>
            {t('Device')} <Text bold>{phase.info.device}</Text> {t('at')}{' '}
            <Text bold>{phase.info.url}</Text>
          </Text>
          <Box marginTop={1} flexDirection="column">
            {phase.fingerprints.map((fingerprint, index) => (
              <Text key={fingerprint}>
                {t('Proxy key {{n}}', { n: String(index + 1) })}{' '}
                <Text color={extendedTheme.ui.brand}>{fingerprint}</Text>
              </Text>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted}>
              {t(
                'Compare every fingerprint with the console’s list, read on a device off this network. Type yes to save:',
              )}
            </Text>
          </Box>
          <Box marginTop={1}>
            <TextInput
              key="fingerprint-answer"
              value={answer}
              onChange={setAnswer}
              onSubmit={submitAnswer}
              placeholder="yes"
              isActive
            />
          </Box>
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted}>{t('esc cancel')}</Text>
          </Box>
        </>
      )}
      {phase.kind === 'opening' && (
        <Box>
          <Box marginRight={1}>
            <Spinner color={extendedTheme.ui.brand} />
          </Box>
          <Text color={extendedTheme.text.muted}>
            {t('Saved. Opening the tunnel and listing your models…')}
          </Text>
        </Box>
      )}
      {phase.kind === 'unreadable' && (
        <>
          <Text color={theme.status.error}>{phase.message}</Text>
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted}>
              {t(
                'The old file stays beside it as a .bak, still readable on the machine that saved it. Type replace to set it aside and save the connection:',
              )}
            </Text>
          </Box>
          <Box marginTop={1}>
            <TextInput
              key="unreadable-answer"
              value={answer}
              onChange={setAnswer}
              onSubmit={submitReplace}
              placeholder="replace"
              isActive
            />
          </Box>
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted}>{t('esc cancel')}</Text>
          </Box>
        </>
      )}
      {phase.kind === 'error' && (
        <Box flexDirection="column">
          <Text color={theme.status.error}>{phase.message}</Text>
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted}>
              {t('enter try again · esc back')}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
