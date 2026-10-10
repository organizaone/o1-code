/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import type { UiDisplayMode } from '@organizaone/o1-code-core/config/config.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';
import { t } from '../../i18n/index.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { DescriptiveRadioButtonSelect } from '../components/shared/DescriptiveRadioButtonSelect.js';
import { DiffRenderer } from '../components/messages/DiffRenderer.js';
import { SummaryToolGroupDisplay } from '../components/messages/SummaryToolGroupDisplay.js';
import {
  showsToolLabel,
  ToolStatusIndicator,
} from '../components/shared/ToolStatusIndicator.js';
import { ToolCallStatus, type IndividualToolCallDisplay } from '../types.js';

/** From this terminal width the step shows a preview beside the choices. */
export const DISPLAY_MODE_PREVIEW_MIN_COLUMNS = 100;

const PREVIEW_WIDTH = 46;

const SAMPLE_DIFF = [
  '--- a/validate.ts',
  '+++ b/validate.ts',
  '@@ -13 +13 @@',
  '-  return raw;',
  '+  return raw.trim().toLowerCase();',
].join('\n');

const sampleSteps = (): IndividualToolCallDisplay[] => [
  {
    callId: 'preview-edit',
    name: 'Edit',
    description: 'validate.ts',
    intent: t('Adjust the e-mail validation'),
    args: { file_path: 'src/auth/validate.ts' },
    resultDisplay: undefined,
    status: ToolCallStatus.Success,
    confirmationDetails: undefined,
  },
  {
    callId: 'preview-shell',
    name: 'Shell',
    description: 'npm test',
    intent: t('Run the authentication tests'),
    args: { command: 'npm test -- src/auth --run' },
    resultDisplay: undefined,
    status: ToolCallStatus.Success,
    confirmationDetails: undefined,
  },
];

const DetailedPreview: React.FC = () => {
  const settings = useSettings();
  const label = showsToolLabel(PREVIEW_WIDTH);
  return (
    <Box flexDirection="column">
      <Box>
        <ToolStatusIndicator
          status={ToolCallStatus.Success}
          name="Edit"
          showLabel={label}
        />
        <Text bold>Edit </Text>
        <Text color={theme.text.code}>src/auth/validate.ts</Text>
      </Box>
      <DiffRenderer
        diffContent={SAMPLE_DIFF}
        filename="validate.ts"
        contentWidth={PREVIEW_WIDTH}
        settings={settings}
      />
      <Box>
        <ToolStatusIndicator
          status={ToolCallStatus.Success}
          name="Shell"
          showLabel={label}
        />
        <Text bold>Shell </Text>
        <Text>npm test -- src/auth --run</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color={theme.text.secondary}>Tests 20 passed (20)</Text>
      </Box>
    </Box>
  );
};

const SummaryPreview: React.FC = () => (
  <Box flexDirection="column">
    <SummaryToolGroupDisplay
      toolCalls={sampleSteps()}
      contentWidth={PREVIEW_WIDTH}
    />
    <Box marginTop={1}>
      <Text color={theme.text.accent}>{`${glyphs().agent} `}</Text>
      <Text wrap="wrap">
        {t('Done. Login now ignores spaces around the e-mail.')}
      </Text>
    </Box>
  </Box>
);

/**
 * Last step of connecting a provider, shown until the person saves a display
 * mode: Detailed (preselected, today's view) or Summary. Esc is handled by
 * the dialog, which skips without saving.
 */
export const DisplayModeStep: React.FC<{
  onChoose: (mode: UiDisplayMode) => void;
}> = ({ onChoose }) => {
  const { columns } = useTerminalSize();
  const [highlighted, setHighlighted] = useState<UiDisplayMode>('detailed');
  const showPreview = columns >= DISPLAY_MODE_PREVIEW_MIN_COLUMNS;

  const items = [
    {
      key: 'detailed',
      value: 'detailed' as const,
      title: (
        <Text>
          {t('Detailed')}
          <Text color={extendedTheme.text.muted}>{`  ${t('as today')}`}</Text>
        </Text>
      ),
      description: t(
        'Shows the code changed, the commands and their output, step by step.',
      ),
    },
    {
      key: 'summary',
      value: 'summary' as const,
      title: t('Summary'),
      description: t(
        'Shows only what is being done, in short sentences. Code and commands stay one ctrl+o away.',
      ),
    },
  ];

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color={theme.status.success}>{`${glyphs().done} `}</Text>
        {t('Account connected.')}
      </Text>
      <Box marginTop={1}>
        <Text bold>{t("How do you want to follow the agent's work?")}</Text>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          <DescriptiveRadioButtonSelect
            items={items}
            initialIndex={0}
            onSelect={onChoose}
            onHighlight={setHighlighted}
            itemGap={1}
          />
        </Box>
        {showPreview && (
          <Box
            flexDirection="column"
            width={PREVIEW_WIDTH + 3}
            marginLeft={2}
            paddingLeft={2}
            borderStyle="single"
            borderTop={false}
            borderRight={false}
            borderBottom={false}
            borderLeftColor={extendedTheme.ui.rule}
          >
            <Text bold color={extendedTheme.text.muted}>
              {t('PREVIEW')}
            </Text>
            {highlighted === 'summary' ? (
              <SummaryPreview />
            ) : (
              <DetailedPreview />
            )}
          </Box>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={extendedTheme.text.muted} wrap="wrap">
          {t(
            'You can change it later in /settings › Display Mode. ctrl+o shows every detail at any time.',
          )}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={extendedTheme.text.muted}>
          {t('↑↓ navigate · enter confirm · esc skip')}
        </Text>
      </Box>
    </Box>
  );
};
