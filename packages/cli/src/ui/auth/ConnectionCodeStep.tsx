/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
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
  checkO1ConnectStore,
  describeO1ConnectError,
  isO1ConnectError,
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
import { localizeO1ConnectDescription } from './o1-connect-message.js';
import type { ProviderSetupFlow } from './useProviderSetupFlow.js';

type Phase =
  | { kind: 'input' }
  | {
      kind: 'confirm';
      fingerprints: string[];
      info: SetupInfo;
      answer: (confirmed: boolean) => void;
    }
  | { kind: 'working'; message: string }
  | {
      kind: 'unreadable';
      message: string;
      filePath: string;
      retry: () => void;
    }
  /** `retry` runs the failed stage again; without it, enter asks for another code. */
  | { kind: 'error'; message: string; retry?: () => void };

// An `o1gw1.` code is read as a code too, so the library refuses it by name
// instead of the text being tried as a path.
const CODE_PREFIXES = ['o1gw2.', 'o1gw1.'];

function protocolOf(authType: AuthType): ProviderProtocol {
  if (authType === AuthType.USE_ANTHROPIC) return 'anthropic';
  if (authType === AuthType.USE_GEMINI) return 'gemini';
  return 'openai';
}

/** The code itself, or the code read from a kit's `o1-connect.code` file. */
function readCode(input: string): { code: string; kitFile?: string } {
  const trimmed = input.trim();
  if (CODE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return { code: trimmed };
  }
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

function removeKitFile(kitFile: string | undefined): void {
  if (!kitFile) return;
  try {
    fs.rmSync(kitFile, { force: true });
  } catch {
    // A kit file that stays behind is the user's; its code no longer works.
  }
}

/**
 * "o1-gateway device code" (contract §3.4): reads the connection code (or
 * the kit's `o1-connect.code`), shows every fingerprint the code pins and
 * asks for an explicit yes, enrols this machine with the code (its one use:
 * the library makes the device's key here and saves it in its store), then
 * opens the tunnel once to list the models through it. The kit file is
 * deleted once its code was used, by this setup or before it.
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
  // The fingerprints already confirmed for this code, so trying the same
  // code again after the tunnel could not be opened does not ask for them a
  // second time.
  const confirmedRef = useRef<string | null>(null);
  const flowRef = useRef(flow);
  flowRef.current = flow;

  useEffect(() => () => controllerRef.current?.abort(), []);

  const begin = (): AbortSignal => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  };

  const showFailure = (
    described: ReturnType<typeof describeO1ConnectError>,
    retry: () => void,
    mayRetry: boolean,
  ) => {
    const message = localizeO1ConnectDescription(described);
    if (described.unreadableSecretFile) {
      setAnswer('');
      setPhase({
        kind: 'unreadable',
        message,
        filePath: described.unreadableSecretFile,
        retry,
      });
      return;
    }
    setPhase({
      kind: 'error',
      message,
      ...(mayRetry ? { retry } : {}),
    });
  };

  /** Opens the tunnel of the configuration just saved and lists the models through it. */
  const listModels = () => {
    const signal = begin();
    const authType = flowRef.current.state.protocol;
    const run = async () => {
      setPhase({
        kind: 'working',
        message: t('Saved. Opening the tunnel and listing your models…'),
      });
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
      flowRef.current.submitConnection(
        check.status === 'rejected' ? undefined : check,
      );
    };
    void run().catch((error: unknown) => {
      if (signal.aborted) return;
      // The code is spent by now: only the tunnel is tried again, and a
      // configuration that cannot come back was already forgotten.
      showFailure(
        describeO1ConnectError(error, { stage: 'open' }),
        listModels,
        isO1ConnectError(error) && error.code === 'tunnel_unavailable',
      );
    });
  };

  const start = (connectionCode: string, kitFile: string | undefined) => {
    const signal = begin();
    // Set once the fingerprints were confirmed: from there the library
    // enrols, and a failure to save comes after the code's one use.
    let enrolling = false;
    const enrol = () => {
      enrolling = true;
      setPhase({
        kind: 'working',
        message: t(
          'Making this device’s key and enrolling it through the tunnel…',
        ),
      });
    };
    const run = async () => {
      setPhase({ kind: 'working', message: t('Checking the secret store…') });
      // Before the code is used: a store that cannot be read is set aside
      // first, while the code still works.
      await checkO1ConnectStore();
      if (signal.aborted) return;
      await setupO1Connect(connectionCode, {
        onFingerprint: (fingerprints, info) => {
          const key = fingerprints.join('\n');
          if (confirmedRef.current === key) {
            enrol();
            return true;
          }
          return new Promise<boolean>((resolve) => {
            setPhase({
              kind: 'confirm',
              fingerprints,
              info,
              answer: (confirmed) => {
                if (confirmed) {
                  confirmedRef.current = key;
                  enrol();
                }
                resolve(confirmed);
              },
            });
          });
        },
      });
      removeKitFile(kitFile);
      if (signal.aborted) return;
      listModels();
    };
    void run().catch((error: unknown) => {
      const described = describeO1ConnectError(error, {
        stage: 'setup',
        code: connectionCode,
      });
      if (described.codeIsDead) removeKitFile(kitFile);
      if (signal.aborted) return;
      const codeWasSpent =
        enrolling && isO1ConnectError(error) && error.code === 'store_failed';
      showFailure(
        codeWasSpent
          ? {
              message: `${localizeO1ConnectDescription(described)} ${t(
                'The code was used by this attempt and nothing was saved: make a new one.',
              )}`,
            }
          : described,
        () => start(connectionCode, kitFile),
        described.retrySameCode === true,
      );
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
    setPhase({ kind: 'working', message: t('Checking the secret store…') });
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
        if (phase.retry) {
          phase.retry();
          return;
        }
        // The code that failed cannot work again: the field starts empty.
        setCode('');
        setPhase({ kind: 'input' });
      }
    },
    { isActive: phase.kind === 'error' || phase.kind === 'working' },
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
              placeholder="o1gw2.…"
              mask={maskKey}
              isActive
            />
          </Box>
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted}>
              {t(
                'A code works once, within 30 minutes of being made. This device’s key is made on this machine and never leaves it.',
              )}
            </Text>
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
      {phase.kind === 'working' && (
        <Box>
          <Box marginRight={1}>
            <Spinner color={extendedTheme.ui.brand} />
          </Box>
          <Text color={extendedTheme.text.muted}>{phase.message}</Text>
        </Box>
      )}
      {phase.kind === 'unreadable' && (
        <>
          <Text color={theme.status.error}>{phase.message}</Text>
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted}>
              {t(
                'The old file stays beside it as a .bak. Type replace to set it aside and save the connection:',
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
              {phase.retry
                ? t('enter try again · esc back')
                : t('enter paste another code · esc back')}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
