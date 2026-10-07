/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { StatsDisplay } from './StatsDisplay.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { theme } from '../semantic-colors.js';
import { t } from '../../i18n/index.js';
import { AuthType } from '@organizaone/o1-code-core/utils/auth-type.js';
import type { ContentGeneratorConfig } from '@organizaone/o1-code-core/core/contentGenerator.js';
import { findProviderByCredentials } from '@organizaone/o1-code-core/providers/all-providers.js';
import {
  isOrganizaOneBaseUrl,
  organizaoneLoginProvider,
  organizaoneProvider,
} from '@organizaone/o1-code-core/providers/presets/organizaone.js';
import {
  credentialIdForProvider,
  readCredential,
} from '@organizaone/o1-code-core/providers/credential-store.js';

function formatConnectionType(
  connection: ContentGeneratorConfig | undefined,
): string {
  if (!connection?.authType) return t('Not connected');
  const protocols: Record<AuthType, string> = {
    [AuthType.USE_OPENAI]: t('OpenAI-compatible API'),
    [AuthType.USE_OPENAI_RESPONSES]: t('OpenAI Responses API'),
    [AuthType.USE_ANTHROPIC]: t('Anthropic API'),
    [AuthType.USE_GEMINI]: t('Gemini API'),
    [AuthType.USE_VERTEX_AI]: 'Vertex AI',
  };
  const protocol = protocols[connection.authType];
  const authentication = connection.apiKey
    ? t('API key')
    : connection.authType === AuthType.USE_VERTEX_AI
      ? t('Application Default Credentials')
      : t('No API key configured');
  const format = (provider?: string, method = authentication) =>
    [provider, protocol, method].filter(Boolean).join(' · ');
  if (connection.connection === 'o1-connect') {
    return format(organizaoneProvider.label, 'o1-gateway / o1-connect');
  }
  if (isOrganizaOneBaseUrl(connection.baseUrl)) {
    const credential = connection.apiKey
      ? readCredential(
          credentialIdForProvider(
            organizaoneLoginProvider.credentialId ??
              organizaoneLoginProvider.id,
          ),
        )
      : undefined;
    const isAccountLogin =
      credential?.apiKey === connection.apiKey &&
      credential?.expiresAt !== undefined;
    return format(
      organizaoneProvider.label,
      isAccountLogin ? t('Account login (browser)') : authentication,
    );
  }
  const provider = findProviderByCredentials(
    connection.baseUrl,
    connection.apiKeyEnvKey,
  );
  if (provider) return format(t(provider.label));
  if (connection.baseUrl) {
    try {
      if (
        ['localhost', '127.0.0.1', '[::1]'].includes(
          new URL(connection.baseUrl).hostname,
        )
      ) {
        return format(t('Local'));
      }
    } catch {
      // An invalid endpoint should not prevent the exit summary from rendering.
    }
  }
  return format();
}

interface SessionSummaryDisplayProps {
  duration: string;
  width: number;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
  width,
}) => {
  const config = useConfig();
  const { stats } = useSessionStats();

  // Only show the resume message if there were messages in the session AND
  // chat recording is enabled (otherwise there is nothing to resume).
  const hasMessages = stats.promptCount > 0;
  const canResume = !!config.getChatRecordingService();

  return (
    <>
      <StatsDisplay
        title={t('Agent powering down. Goodbye!')}
        duration={duration}
        width={width}
        connectionType={formatConnectionType(
          config.getContentGeneratorConfig(),
        )}
      />
      {hasMessages && canResume && (
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {t('To continue this session, run')}{' '}
            <Text color={theme.text.accent}>
              o1-code --resume {stats.sessionId}
            </Text>
          </Text>
        </Box>
      )}
    </>
  );
};
