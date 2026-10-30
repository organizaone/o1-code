/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import wrapAnsi from 'wrap-ansi';
import { BRAND } from '../../generated/brand.js';
import { t } from '../../i18n/index.js';
import type { ApplicationUpdateState } from '../hooks/use-application-update.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs, TOP_FRAME } from '../glyphs.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';

interface ApplicationUpdateDialogProps {
  state: ApplicationUpdateState;
  availableHeight: number;
  onApply: () => void;
  onLater: () => void;
}

export function ApplicationUpdateDialog({
  state,
  availableHeight,
  onApply,
  onLater,
}: ApplicationUpdateDialogProps) {
  const { columns, rows } = useTerminalSize();
  const width = Math.max(1, Math.min(92, columns - 4));
  const contentWidth = Math.max(1, width - 4);
  const budget = Math.max(1, Math.min(rows, Math.floor(availableHeight)));
  const [offset, setOffset] = useState(0);
  const busy = state.phase === 'preparing' || state.phase === 'restarting';
  const titles = {
    available: t('A new version is available'),
    preparing: t('Preparing the update'),
    ready: t('Ready to restart'),
    failed: t('The update could not be prepared'),
    restarting: t('Restarting'),
  };
  const descriptions = {
    available: t(
      'Update now, or continue and update the next time you open the app.',
    ),
    preparing: t(
      'You can continue using the app. The update takes effect after restarting.',
    ),
    ready: t(
      'The update is prepared. Restart now, or apply it the next time you open the app.',
    ),
    failed: t('Your current version is still available.'),
    restarting: t('Opening the prepared version.'),
  };
  const items = [
    ...(!busy &&
    (state.canRestart || (state.canPrepare && state.phase !== 'ready'))
      ? [
          {
            key: 'apply',
            value: 'apply' as const,
            label: !state.canRestart
              ? t('Prepare update')
              : state.phase === 'ready'
                ? t('Restart and update')
                : state.phase === 'failed'
                  ? t('Try again')
                  : t('Update and restart'),
          },
        ]
      : []),
    ...(state.phase !== 'restarting'
      ? [
          {
            key: 'later',
            value: 'later' as const,
            label:
              state.phase === 'preparing' ? t('Continue using') : t('Later'),
          },
        ]
      : []),
  ];
  const detailText = [
    descriptions[state.phase],
    ...(state.error ? [state.error] : []),
    ...(!state.canRestart || state.phase === 'failed'
      ? state.instructions
      : []),
  ].join('\n');
  const detailLines = wrapAnsi(detailText, contentWidth, {
    hard: true,
    trim: false,
  }).split('\n');
  const statusRows = budget >= 9 ? 1 : 0;
  const footerRows = budget >= 8 ? 1 : 0;
  const actionRows = Math.min(items.length, Math.max(1, budget - 4));
  const detailRows = Math.max(
    0,
    Math.min(
      detailLines.length,
      budget - 3 - statusRows - footerRows - actionRows,
    ),
  );
  const maxOffset = Math.max(0, detailLines.length - detailRows);
  const visibleOffset = Math.min(offset, maxOffset);
  const needsPaging = detailRows > 0 && detailLines.length > detailRows;
  const height = Math.min(
    budget,
    3 + statusRows + footerRows + actionRows + detailRows,
  );
  const frameColor =
    state.phase === 'failed' ? theme.status.error : extendedTheme.ui.brand;
  const frame = TOP_FRAME[glyphs().borderStyle];

  useEffect(() => {
    setOffset(0);
  }, [state.phase, state.info.update.latest]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') onLater();
      if (key.name === 'pageup') {
        setOffset((previous) =>
          Math.max(0, previous - Math.max(1, detailRows)),
        );
      }
      if (key.name === 'pagedown') {
        setOffset((previous) =>
          Math.min(maxOffset, previous + Math.max(1, detailRows)),
        );
      }
      if (key.name === 'home') setOffset(0);
      if (key.name === 'end') setOffset(maxOffset);
    },
    { isActive: true },
  );

  return (
    <Box width={width} height={height} flexDirection="column" overflow="hidden">
      <Box height={1} flexShrink={0}>
        <Text color={frameColor}>{`${frame.topLeft}${frame.top} `}</Text>
        <Box flexShrink={1} minWidth={0}>
          <Text color={theme.text.primary} bold wrap="truncate-end">
            {statusRows
              ? t('{{product}} update', { product: BRAND.displayName })
              : titles[state.phase]}
          </Text>
        </Box>
        <Text color={frameColor}> </Text>
        <Box flexGrow={1} flexShrink={1} flexBasis={0} overflow="hidden">
          <Text color={frameColor}>{frame.top.repeat(width)}</Text>
        </Box>
        <Text color={frameColor}>{frame.topRight}</Text>
      </Box>
      <Box
        height={Math.max(0, height - 1)}
        borderStyle={glyphs().borderStyle}
        borderTop={false}
        borderColor={frameColor}
        flexDirection="column"
        paddingX={1}
        overflow="hidden"
      >
        {statusRows > 0 && (
          <Text bold color={theme.text.primary} wrap="truncate-end">
            {titles[state.phase]}
          </Text>
        )}
        <Text color={theme.text.secondary} wrap="truncate-end">
          {`${state.info.update.current} → ${state.info.update.latest}`}
        </Text>
        {detailRows > 0 && (
          <Box height={detailRows} flexShrink={0} flexDirection="column">
            {detailLines
              .slice(visibleOffset, visibleOffset + detailRows)
              .map((line, index) => (
                <Text
                  key={visibleOffset + index}
                  color={extendedTheme.text.muted}
                  wrap="truncate-end"
                >
                  {line || ' '}
                </Text>
              ))}
          </Box>
        )}
        {items.length > 0 && (
          <BaseSelectionList
            key={`${state.phase}:${state.canRestart}`}
            items={items}
            maxItemsToShow={actionRows}
            onSelect={(action) => (action === 'apply' ? onApply() : onLater())}
            renderItem={(item, { titleColor, isSelected }) => (
              <Text color={titleColor} bold={isSelected} wrap="truncate-end">
                {item.label}
              </Text>
            )}
          />
        )}
        {footerRows > 0 && (
          <Text color={extendedTheme.text.muted} wrap="truncate-end">
            {needsPaging
              ? t('PgUp/PgDn details · esc later')
              : t('↑↓ choose · enter select · esc later')}
          </Text>
        )}
      </Box>
    </Box>
  );
}
