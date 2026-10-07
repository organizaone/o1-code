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
  organizaoneProvider,
} from '@organizaone/o1-code-core/providers/presets/organizaone.js';

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
  if (connection.connection === 'o1-connect') {
    return `${organizaoneProvider.label} · ${t('o1-gateway device code')} · ${protocol}`;
  }
  if (isOrganizaOneBaseUrl(connection.baseUrl)) {
    return `${organizaoneProvider.label} · ${protocol}`;
  }
  const provider = findProviderByCredentials(
    connection.baseUrl,
    connection.apiKeyEnvKey,
  );
  if (provider) return `${t(provider.label)} · ${protocol}`;
  if (connection.baseUrl) {
    try {
      if (
        ['localhost', '127.0.0.1', '[::1]'].includes(
          new URL(connection.baseUrl).hostname,
        )
      ) {
        return `${t('Local')} · ${protocol}`;
      }
    } catch {
      // An invalid endpoint should not prevent the exit summary from rendering.
    }
  }
  return protocol;
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
