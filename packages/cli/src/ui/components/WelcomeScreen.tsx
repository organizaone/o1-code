/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { SessionListItem } from '@organizaone/o1-code-core/services/sessionService.js';
import { DEFAULT_CONTEXT_FILENAME } from '@organizaone/o1-code-core/utils/memory-constants.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { t } from '../../i18n/index.js';
import { BRAND } from '../../generated/brand.js';
import { formatSessionAge } from '../utils/session-age.js';
import {
  getRecentSessions,
  primeRecentSessions,
} from '../utils/recent-sessions.js';

const MAX_RECENT_SESSIONS = 3;
const AGE_COLUMN = 11;

/**
 * Renders a translated line whose `{{name}}` placeholders are code (commands,
 * files), painted in the code colour instead of being interpolated as text.
 */
function CodeLine({
  template,
  code,
}: {
  template: string;
  code: Record<string, string>;
}): React.JSX.Element {
  const parts = template.split(/(\{\{\w+\}\})/);
  return (
    <Text color={theme.text.secondary}>
      {parts.map((part, index) => {
        const name = /^\{\{(\w+)\}\}$/.exec(part)?.[1];
        return name && code[name] !== undefined ? (
          <Text key={index} color={extendedTheme.activity.read}>
            {code[name]}
          </Text>
        ) : (
          part
        );
      })}
    </Text>
  );
}

function SectionTitle({ children }: { children: string }): React.JSX.Element {
  return (
    <Box marginTop={1}>
      <Text color={extendedTheme.text.muted} bold>
        {children.toUpperCase()}
      </Text>
    </Box>
  );
}

function Bullet({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box paddingLeft={2}>
      <Text color={extendedTheme.ui.brand}>{'• '}</Text>
      {children}
    </Box>
  );
}

/**
 * The project's recent sessions: primed before the first render when the app
 * starts, read here only when they were not (a failure shows none).
 */
function useRecentSessions(
  cwd: string,
  skip: boolean,
): SessionListItem[] | undefined {
  const [sessions, setSessions] = useState(() => getRecentSessions(cwd));
  useEffect(() => {
    if (skip || getRecentSessions(cwd)) return;
    let active = true;
    void primeRecentSessions(cwd).then(() => {
      if (active) setSessions(getRecentSessions(cwd));
    });
    return () => {
      active = false;
    };
  }, [cwd, skip]);
  return sessions;
}

/** One line to name a session by: its title, or its first prompt line. */
function sessionTitle(session: SessionListItem): string {
  const text = session.customTitle?.trim() || session.prompt.trim();
  return text.split(/\r?\n/)[0]!.trim();
}

export interface WelcomeScreenProps {
  /** Sessions to list; when absent they are read from the project. */
  sessions?: SessionListItem[];
  currentSessionId?: string;
  cwd?: string;
  now?: number;
}

/** The start of an empty conversation (spec §6.1). */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  sessions: givenSessions,
  currentSessionId,
  cwd = process.cwd(),
  now,
}) => {
  const loaded = useRecentSessions(cwd, givenSessions !== undefined);
  const recent = (givenSessions ?? loaded ?? [])
    // Sessions where nothing was asked have no name to show.
    .filter(
      (session) =>
        session.sessionId !== currentSessionId &&
        (session.customTitle?.trim() || session.prompt.trim()),
    )
    .slice(0, MAX_RECENT_SESSIONS);

  return (
    <Box flexDirection="column" marginLeft={2} marginRight={2}>
      <Text color={theme.text.primary} bold>
        {t('Welcome to {{product}}.', { product: BRAND.productName })}
      </Text>
      <Text color={theme.text.secondary}>
        {t(
          'Describe a task and the agent works in the open project: it reads, edits, runs commands and asks for approval.',
        )}
      </Text>

      <SectionTitle>{t('Getting started')}</SectionTitle>
      <Bullet>
        <Text color={theme.text.secondary}>
          {t('Ask in plain language: "explain the structure of this project"')}
        </Text>
      </Bullet>
      <Bullet>
        <CodeLine
          template={t(
            'Mention files with {{at}} and use commands with {{slash}}',
          )}
          code={{ at: '@', slash: '/' }}
        />
      </Bullet>
      <Bullet>
        <CodeLine
          template={t(
            '{{file}} holds project instructions — run {{init}} to create it',
          )}
          code={{ file: DEFAULT_CONTEXT_FILENAME, init: '/init' }}
        />
      </Bullet>

      {recent.length > 0 && (
        <>
          <SectionTitle>{t('Recent sessions')}</SectionTitle>
          {recent.map((session) => (
            <Box key={session.sessionId} paddingLeft={2}>
              <Box minWidth={AGE_COLUMN} flexShrink={0} marginRight={2}>
                <Text color={extendedTheme.text.muted}>
                  {formatSessionAge(session.mtime, now)}
                </Text>
              </Box>
              <Text color={theme.text.secondary} wrap="truncate-end">
                {sessionTitle(session)}
              </Text>
            </Box>
          ))}
          <Box paddingLeft={2}>
            <CodeLine
              template={t('{{resume}} to continue a session')}
              code={{ resume: '/resume' }}
            />
          </Box>
        </>
      )}
    </Box>
  );
};
