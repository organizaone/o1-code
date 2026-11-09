/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { Box, Text } from 'ink';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs, TOP_FRAME } from '../glyphs.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { t } from '../../i18n/index.js';
import type {
  ProviderUpdateEntry,
  UpdateChoice,
} from '../hooks/useProviderUpdates.js';

interface ProviderUpdatePromptProps {
  entries: ProviderUpdateEntry[];
  onConfirm: (choice: UpdateChoice) => void;
}

const ProviderDiffSection = ({ entry }: { entry: ProviderUpdateEntry }) => {
  const { providerLabel, diff } = entry;
  const hasModelChanges = diff.added.length > 0 || diff.removed.length > 0;

  return (
    <Box flexDirection="column">
      <Text bold color={theme.text.secondary}>
        {providerLabel}
      </Text>
      {hasModelChanges ? (
        <Box flexDirection="column">
          {diff.added.map((model) => (
            <Text key={model} color={theme.status.success}>
              {'  + '}
              {model}
            </Text>
          ))}
          {diff.removed.map((model) => (
            <Text key={model} color={theme.status.error}>
              {'  - '}
              {model}
            </Text>
          ))}
        </Box>
      ) : (
        <Text color={theme.text.secondary}>
          {'  '}
          {t('Model parameters updated (context window, capabilities, etc.)')}
        </Text>
      )}
    </Box>
  );
};

export const ProviderUpdatePrompt = ({
  entries,
  onConfirm,
}: ProviderUpdatePromptProps) => {
  const handleKeypress = useCallback(
    (key: Key) => {
      if (key.name === 'escape') {
        onConfirm('later');
      }
    },
    [onConfirm],
  );
  useKeypress(handleKeypress, { isActive: true });

  const affectedEntry = entries.find((e) => e.diff.currentModelAffected);

  const title =
    entries.length === 1
      ? t('Built-in Provider Update · {{provider}}', {
          provider: entries[0]!.providerLabel,
        })
      : t('Built-in Provider Updates');

  const frame = TOP_FRAME[glyphs().borderStyle];
  const frameColor = extendedTheme.ui.brand;

  // The same frame as the application update: a brand border that asks for
  // a choice, with the title set into its top edge.
  return (
    <Box flexDirection="column">
      <Box height={1}>
        <Text color={frameColor}>{`${frame.topLeft}${frame.top} `}</Text>
        <Box flexShrink={1} minWidth={0}>
          <Text color={theme.text.primary} bold wrap="truncate-end">
            {title}
          </Text>
        </Box>
        <Text color={frameColor}> </Text>
        <Box flexGrow={1} flexShrink={1} flexBasis={0} overflow="hidden">
          <Text color={frameColor}>{frame.top.repeat(400)}</Text>
        </Box>
        <Text color={frameColor}>{frame.topRight}</Text>
      </Box>
      <Box
        borderStyle={glyphs().borderStyle}
        borderTop={false}
        borderColor={frameColor}
        flexDirection="column"
        paddingY={1}
        paddingX={2}
      >
        <Box flexDirection="column" gap={1}>
          {entries.map((entry) => (
            <ProviderDiffSection key={entry.providerLabel} entry={entry} />
          ))}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {affectedEntry && (
            <Text color={theme.status.warning}>
              {t(
                'Note: Your selected model is being removed. Please choose a new one with /model.',
              )}
            </Text>
          )}
          <Text color={extendedTheme.text.muted}>
            {t('Your credentials will not be modified.')}
          </Text>
        </Box>

        <Box marginTop={1}>
          <RadioButtonSelect
            items={[
              {
                label: t('Update all'),
                value: 'update' as UpdateChoice,
                key: 'update',
              },
              {
                label: t('Skip this version'),
                value: 'skip' as UpdateChoice,
                key: 'skip',
              },
              {
                label: t('Remind me later'),
                value: 'later' as UpdateChoice,
                key: 'later',
              },
            ]}
            onSelect={onConfirm}
          />
        </Box>

        <Box marginTop={1}>
          <Text color={extendedTheme.text.muted} wrap="truncate-end">
            {t('↑↓ choose · enter select · esc later')}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
