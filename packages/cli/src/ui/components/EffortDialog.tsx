/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { REASONING_EFFORT_TIERS } from '@organizaone/o1-code-core/core/reasoning-effort.js';
import type { ReasoningEffort } from '@organizaone/o1-code-core/core/reasoning-effort.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { REASONING_EFFORT_DEFAULT } from '../../acp-integration/model-configuration.js';
import type { EffortSelection } from '../commands/effort-utils.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { t } from '../../i18n/index.js';

interface EffortDialogProps {
  /**
   * Callback with the choice: a tier, or `default` to clear it; `undefined`
   * means the dialog was cancelled.
   */
  onSelect: (selection: EffortSelection | undefined) => void;

  /** The currently active effort, used to pre-select the list. */
  currentEffort?: ReasoningEffort;
  efforts?: readonly ReasoningEffort[];
}

export const EFFORT_DESCRIPTIONS: Record<ReasoningEffort, string> = {
  low: 'Fastest and cheapest; least reasoning.',
  medium: 'Balanced speed, cost, and reasoning.',
  high: 'Strong reasoning for hard tasks.',
  xhigh: 'Extended reasoning for agentic/coding work.',
  max: 'Maximum reasoning; highest cost and latency.',
};

export function EffortDialog({
  onSelect,
  currentEffort,
  efforts = REASONING_EFFORT_TIERS,
}: EffortDialogProps): React.JSX.Element {
  const items = [
    {
      label: `${REASONING_EFFORT_DEFAULT} — ${t('The model/provider decides; no tier of its own.')}`,
      value: REASONING_EFFORT_DEFAULT as EffortSelection,
      key: REASONING_EFFORT_DEFAULT,
    },
    ...efforts.map((tier) => ({
      label: `${tier} — ${t(EFFORT_DESCRIPTIONS[tier])}`,
      value: tier as EffortSelection,
      key: tier,
    })),
  ];

  // Unset starts on `default`, which is what it is. A tier the global
  // `model.reasoningEffort` carried over from another model (only ACP sessions
  // reconcile it) is not offered here, so it starts on `default` too rather
  // than on a tier that would read as current.
  const configuredIndex = currentEffort ? efforts.indexOf(currentEffort) : -1;
  const initialIndex = configuredIndex + 1;

  const handleSelect = useCallback(
    (selection: EffortSelection) => {
      onSelect(selection);
    },
    [onSelect],
  );

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onSelect(undefined);
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>
        {'> '}
        {t('Reasoning Effort')}{' '}
        <Text color={theme.text.secondary}>
          {t('(applied across all providers; clamped per model)')}
        </Text>
      </Text>
      <Box height={1} />
      <RadioButtonSelect
        items={items}
        initialIndex={initialIndex}
        onSelect={handleSelect}
        isFocused
        showNumbers
      />
      {currentEffort && configuredIndex === -1 && (
        <Box marginTop={1}>
          <Text color={theme.text.secondary} wrap="truncate">
            {t(
              '{{effort}} is not available for this model — using the model/provider default.',
              { effort: currentEffort },
            )}
          </Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary} wrap="truncate">
          {t('(Use Enter to select, Esc to cancel)')}
        </Text>
      </Box>
    </Box>
  );
}
