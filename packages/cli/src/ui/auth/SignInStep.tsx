/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useContext, useEffect, useRef, useState } from 'react';
import os from 'node:os';
import { Box, Text } from 'ink';
import Link from 'ink-link';
import { AuthType } from '@organizaone/o1-code-core/core/contentGenerator.js';
import {
  checkProviderKey,
  type ProviderProtocol,
} from '@organizaone/o1-code-core/providers/model-discovery.js';
import type { ProviderConfig } from '@organizaone/o1-code-core/providers/types.js';
import {
  DeviceAuthError,
  abortableSleep,
  defaultDeviceName,
  formatUserCode,
  pollDeviceToken,
  startDeviceAuthorization,
  type DeviceAuthorization,
  type FetchLike,
} from '@organizaone/o1-code-core/providers/organizaone-device-auth.js';
import {
  openBrowserSecurely,
  shouldLaunchBrowser,
} from '@organizaone/o1-code-core/utils/secure-browser-launcher.js';
import { Spinner } from '../components/RespondingSpinner.js';
import { AppContext } from '../contexts/AppContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { t } from '../../i18n/index.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import type { ProviderSetupFlow } from './useProviderSetupFlow.js';

type Phase =
  | { kind: 'starting' }
  | { kind: 'waiting'; authorization: DeviceAuthorization; browser: boolean }
  | { kind: 'checking' }
  | { kind: 'error'; message: string };

function protocolOf(authType: AuthType): ProviderProtocol {
  if (authType === AuthType.USE_ANTHROPIC) return 'anthropic';
  if (authType === AuthType.USE_GEMINI) return 'gemini';
  return 'openai';
}

/**
 * "Sign in with your account": the proxy's device authorization. The step
 * starts the flow, shows the code and the page, opens the browser when there
 * is one, waits for the approval, checks the token against the proxy's model
 * list, and hands the token to the flow. The password never comes through
 * o1-code: it is typed on the proxy's page.
 */
export function SignInStep({
  config,
  flow,
}: {
  config: ProviderConfig;
  flow: ProviderSetupFlow;
}): React.JSX.Element {
  const clientVersion = useContext(AppContext)?.version;
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const flowRef = useRef(flow);
  flowRef.current = flow;

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    const fetch = globalThis.fetch as unknown as FetchLike;
    const baseUrl = flowRef.current.state.baseUrl;
    const protocol = protocolOf(flowRef.current.state.protocol);

    const run = async () => {
      setPhase({ kind: 'starting' });
      const authorization = await startDeviceAuthorization({
        baseUrl,
        deviceName: defaultDeviceName(os.hostname()),
        fetch,
        signal,
      });
      if (signal.aborted) return;
      let browser = false;
      if (shouldLaunchBrowser()) {
        browser = true;
        void openBrowserSecurely(authorization.verificationUriComplete).catch(
          () => {
            if (!signal.aborted) {
              setPhase((current) =>
                current.kind === 'waiting'
                  ? { ...current, browser: false }
                  : current,
              );
            }
          },
        );
      }
      setPhase({ kind: 'waiting', authorization, browser });
      const token = await pollDeviceToken({
        baseUrl,
        authorization,
        fetch,
        sleep: abortableSleep,
        signal,
      });
      if (signal.aborted) return;
      setPhase({ kind: 'checking' });
      const check = await checkProviderKey({
        protocol,
        baseUrl,
        apiKey: token.accessToken,
        staticModels: config.models ?? [],
        signal,
        clientVersion,
      });
      if (signal.aborted) return;
      flowRef.current.submitSignIn(
        token,
        check.status === 'rejected' ? undefined : check,
      );
    };

    run().catch((error: unknown) => {
      if (signal.aborted) return;
      const message =
        error instanceof DeviceAuthError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      setPhase({ kind: 'error', message });
    });

    return () => controller.abort();
    // `attempt` restarts the flow after an error; the rest is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        controllerRef.current?.abort();
        flowRef.current.goBack();
        return;
      }
      if (key.name === 'return' && phase.kind === 'error') {
        setAttempt((n) => n + 1);
      }
    },
    { isActive: true },
  );

  return (
    <Box marginTop={1} flexDirection="column">
      {phase.kind === 'starting' && (
        <Box>
          <Box marginRight={1}>
            <Spinner color={extendedTheme.ui.brand} />
          </Box>
          <Text color={extendedTheme.text.muted}>
            {t('Asking OrganizaOne for a sign-in code…')}
          </Text>
        </Box>
      )}
      {phase.kind === 'waiting' && (
        <>
          <Box>
            <Text>{t('Your code')}: </Text>
            <Text bold color={extendedTheme.ui.brand}>
              {formatUserCode(phase.authorization.userCode)}
            </Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={extendedTheme.text.muted}>
              {phase.browser
                ? t(
                    'The sign-in page is opening in your browser. Elsewhere, open:',
                  )
                : t(
                    'Open this address on any device, sign in and enter the code:',
                  )}
            </Text>
            <Link
              url={phase.authorization.verificationUriComplete}
              fallback={false}
            >
              <Text color={theme.text.link}>
                {phase.authorization.verificationUriComplete}
              </Text>
            </Link>
          </Box>
          <Box marginTop={1}>
            <Box marginRight={1}>
              <Spinner color={extendedTheme.ui.brand} />
            </Box>
            <Text color={extendedTheme.text.muted}>
              {t('Waiting for your approval…')}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted}>{t('esc cancel')}</Text>
          </Box>
        </>
      )}
      {phase.kind === 'checking' && (
        <Box>
          <Box marginRight={1}>
            <Spinner color={extendedTheme.ui.brand} />
          </Box>
          <Text color={extendedTheme.text.muted}>
            {t('Approved. Listing your models…')}
          </Text>
        </Box>
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
