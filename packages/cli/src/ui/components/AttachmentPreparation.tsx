/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { t } from '../../i18n/index.js';
import { theme, extendedTheme } from '../semantic-colors.js';
import type { AttachmentPreparationState } from '../hooks/use-attachment-preparation.js';

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function AttachmentPreparation({
  state,
  notice,
  startedAt,
  pasteBytes,
}: {
  state: AttachmentPreparationState;
  notice: 'wait' | 'cancelled' | null;
  startedAt: number;
  pasteBytes?: number;
}) {
  const [now, setNow] = useState(Date.now());
  const busy =
    state === 'reading' || state === 'preparing' || pasteBytes !== undefined;
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [busy, startedAt]);
  if (!busy && state !== 'error' && !notice) return null;
  const elapsed = Math.max(0, now - startedAt) / 1000;
  return (
    <Box marginLeft={2} marginRight={2} flexDirection="column">
      {busy && (
        <Text color={extendedTheme.ui.brandSoft} wrap="truncate-end">
          {frames[Math.floor(now / 100) % frames.length]}{' '}
          {pasteBytes !== undefined ? (
            t('Pasting text… {{size}} KB', {
              size: String(Math.ceil(pasteBytes / 1024)),
            })
          ) : (
            <>
              {t(
                state === 'reading'
                  ? 'Reading image…'
                  : 'Preparing attachment…',
              )}{' '}
              · {elapsed.toFixed(1)} s · {t('Esc to cancel')}
            </>
          )}
        </Text>
      )}
      {state === 'error' && (
        <Text color={theme.status.error}>
          ⚠{' '}
          {t(
            'Could not prepare the attachment. Paste it again to retry; Esc to dismiss.',
          )}
        </Text>
      )}
      {notice === 'wait' && (
        <Text color={theme.status.warning}>
          {t('Wait for the attachment to finish preparing before sending.')}
        </Text>
      )}
      {notice === 'cancelled' && (
        <Text color={theme.text.secondary}>
          {t('Attachment preparation cancelled. Your prompt was preserved.')}
        </Text>
      )}
    </Box>
  );
}
