/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { extendedTheme, theme } from '../../semantic-colors.js';
import { glyphs, TOP_FRAME } from '../../glyphs.js';
import { t } from '../../../i18n/index.js';
import type { HistoryItemUpdateNotice } from '../../types.js';

type UpdateNoticeProps = Omit<HistoryItemUpdateNotice, 'id' | 'type'>;

/**
 * A framed notice for an update of O1-Code itself. The frame is brand blue
 * (red for a failure) with the title set into its top edge in bold primary
 * text, so it stands apart from the one-line status messages around it.
 */
export const UpdateNotice: React.FC<UpdateNoticeProps> = ({
  status,
  version,
  fromVersion,
  text,
  highlights = [],
  moreCount = 0,
  notesUrl,
}) => {
  const frameColor =
    status === 'failed' ? theme.status.error : extendedTheme.ui.brand;
  const title =
    status === 'whats_new'
      ? t("What's new in {{version}}", { version: version ?? '' })
      : t('Update');
  const frame = TOP_FRAME[glyphs().borderStyle];

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={frameColor}>{`${frame.topLeft}${frame.top} `}</Text>
        <Text color={theme.text.primary} bold>
          {title}
        </Text>
        <Text color={frameColor}> </Text>
        <Box
          flexGrow={1}
          flexShrink={1}
          flexBasis={0}
          height={1}
          overflow="hidden"
        >
          <Text color={frameColor}>{frame.top.repeat(400)}</Text>
        </Box>
        <Text color={frameColor}>{frame.topRight}</Text>
      </Box>
      <Box
        borderStyle={glyphs().borderStyle}
        borderTop={false}
        borderColor={frameColor}
        flexDirection="column"
        paddingX={1}
      >
        {status === 'whats_new' ? (
          <>
            {fromVersion && (
              <Text color={extendedTheme.text.muted}>
                {t('Updated from {{from}} to {{to}}', {
                  from: fromVersion,
                  to: version ?? '',
                })}
              </Text>
            )}
            {highlights.map((line, index) => (
              <Box key={index}>
                <Box width={2} flexShrink={0}>
                  <Text color={extendedTheme.ui.brand}>{glyphs().dot}</Text>
                </Box>
                <Text color={theme.text.primary} wrap="wrap">
                  {line}
                </Text>
              </Box>
            ))}
            {(moreCount > 0 || notesUrl) && (
              <Text color={extendedTheme.text.muted} wrap="wrap">
                {moreCount > 0
                  ? `${t('and {{count}} more', { count: String(moreCount) })}${notesUrl ? ' · ' : ''}`
                  : ''}
                {notesUrl && (
                  <>
                    {`${t('full notes')}: `}
                    <Text color={theme.text.link}>{notesUrl}</Text>
                  </>
                )}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text wrap="wrap">
              <Text
                color={
                  status === 'installed'
                    ? theme.status.success
                    : status === 'failed'
                      ? theme.status.error
                      : extendedTheme.ui.brandSoft
                }
              >
                {status === 'installed'
                  ? glyphs().done
                  : status === 'failed'
                    ? '✕'
                    : '↻'}
              </Text>
              <Text color={theme.text.primary} bold>
                {` ${
                  status === 'installed'
                    ? version
                      ? t('O1-Code {{version}} installed', { version })
                      : t('O1-Code was updated')
                    : status === 'failed'
                      ? version
                        ? t('The update to {{version}} failed', { version })
                        : t('The update failed')
                      : t('O1-Code {{version}} is available', {
                          version: version ?? '',
                        })
                }`}
              </Text>
            </Text>
            {status === 'installed' && (
              <Text color={extendedTheme.text.muted}>
                {t('It takes effect the next time you open O1-Code.')}
              </Text>
            )}
            {text && (
              <Text color={extendedTheme.text.muted} wrap="wrap">
                {text}
              </Text>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};
