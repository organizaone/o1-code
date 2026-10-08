/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { BaseSelectionList } from './BaseSelectionList.js';
import type { SelectionListItem } from '../../hooks/useSelectionList.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { extendedTheme, theme } from '../../semantic-colors.js';
import { glyphs } from '../../glyphs.js';
import { getCachedStringWidth } from '../../utils/textUtils.js';
import { TextInput } from './TextInput.js';
import { t } from '../../../i18n/index.js';

export interface SelectionDialogItem<T> extends SelectionListItem<T> {
  label: string;
  description: string;
}

interface SelectionDialogProps<T> {
  title: string;
  subtitle: string;
  items: Array<SelectionDialogItem<T>>;
  currentValue: T;
  initialValue: T;
  onHighlight: (value: T) => void;
  onSelect: (value: T) => void;
  footer: string;
  warning?: string;
  availableTerminalHeight?: number;
  availableWidth?: number;
  embedded?: boolean;
  isActive?: boolean;
  filter?: { value: string; onChange: (value: string) => void };
  textNavigation?: boolean;
  onHeightChange?: (height: number) => void;
}

export function SelectionDialog<T>({
  title,
  subtitle,
  items,
  currentValue,
  initialValue,
  onHighlight,
  onSelect,
  footer,
  warning,
  availableTerminalHeight,
  availableWidth,
  embedded = false,
  isActive = true,
  filter,
  textNavigation = false,
  onHeightChange,
}: SelectionDialogProps<T>) {
  const { columns, rows } = useTerminalSize();
  const width = Math.max(1, Math.min(columns - 4, 140, availableWidth ?? 140));
  const contentWidth = Math.max(1, width - (embedded ? 0 : 4));
  const budget = Math.max(1, Math.floor(availableTerminalHeight ?? rows - 2));
  const initialIndex = Math.max(
    0,
    items.findIndex((item) => item.value === initialValue),
  );
  const [highlightedKey, setHighlightedKey] = useState<string | undefined>(
    items[initialIndex]?.key,
  );
  const initialKey = items[initialIndex]?.key;
  useEffect(() => {
    setHighlightedKey(initialKey);
  }, [initialKey]);
  const highlightedIndex = Math.max(
    0,
    items.findIndex((item) => item.key === highlightedKey),
  );
  const highlighted = items[highlightedIndex];
  const warningRows = warning
    ? Math.min(
        Math.ceil(getCachedStringWidth(warning) / contentWidth),
        Math.max(1, budget - 4),
      )
    : 0;
  const footerRows = budget >= 5 + warningRows ? 1 : 0;
  const subtitleRows = subtitle && budget >= 7 + warningRows ? 1 : 0;
  const spacerRows = budget >= 8 + warningRows ? 1 : 0;
  const filterRows = filter ? 1 : 0;
  const chromeRows =
    (embedded ? 1 : 3) +
    warningRows +
    footerRows +
    subtitleRows +
    spacerRows +
    filterRows;
  const bodyBudget = Math.max(1, budget - chromeRows);
  const sideHelp = width >= 116 && bodyBudget >= 4;
  const descriptionRows = sideHelp
    ? 0
    : Math.min(
        3,
        Math.max(0, bodyBudget - Math.max(1, Math.min(2, items.length))),
      );
  const listRows = Math.max(
    1,
    Math.min(9, items.length, bodyBudget - descriptionRows),
  );
  const bodyHeight = sideHelp
    ? Math.min(bodyBudget, Math.max(5, listRows))
    : listRows + descriptionRows;
  const height = Math.min(budget, chromeRows + bodyHeight);
  useEffect(() => {
    onHeightChange?.(height);
  }, [height, onHeightChange]);

  return (
    <Box
      width={width}
      height={height}
      borderStyle={embedded ? undefined : glyphs().borderStyle}
      borderColor={extendedTheme.ui.rule}
      paddingX={embedded ? 0 : 1}
      flexDirection="column"
      overflow="hidden"
    >
      <Text bold color={extendedTheme.ui.brand} wrap="truncate-end">
        {title}
      </Text>
      {subtitleRows > 0 && (
        <Text color={extendedTheme.text.muted} wrap="truncate-end">
          {subtitle}
        </Text>
      )}
      {spacerRows > 0 && <Box height={1} />}
      {filter && (
        <Box height={1} flexShrink={0}>
          <Text color={theme.text.secondary}>{t('Search:')} </Text>
          <TextInput
            isActive={isActive}
            value={filter.value}
            onChange={filter.onChange}
            placeholder={t('type to filter…')}
            inputWidth={Math.max(
              1,
              contentWidth - getCachedStringWidth(t('Search:')) - 3,
            )}
            onUp={() => {}}
            onDown={() => {}}
          />
        </Box>
      )}
      <Box
        height={bodyHeight}
        flexShrink={0}
        flexDirection={sideHelp ? 'row' : 'column'}
        overflow="hidden"
      >
        <Box
          width={sideHelp ? '48%' : '100%'}
          paddingRight={sideHelp ? 1 : 0}
          flexDirection="column"
        >
          <BaseSelectionList
            isFocused={isActive}
            items={items}
            initialIndex={initialIndex}
            onSelect={onSelect}
            onHighlight={(value) => {
              setHighlightedKey(
                items.find((item) => item.value === value)?.key,
              );
              onHighlight(value);
            }}
            maxItemsToShow={listRows}
            showNumbers={!filter && !textNavigation}
            disableVimNav={!!filter || textNavigation}
            showScrollArrows={false}
            renderItem={(item, { titleColor, isSelected }) => (
              <Box width="100%">
                <Box flexGrow={1} minWidth={0}>
                  <Text
                    color={titleColor}
                    bold={isSelected}
                    wrap="truncate-end"
                  >
                    {item.label}
                  </Text>
                </Box>
                {item.value === currentValue && (
                  <Box marginLeft={1} flexShrink={0}>
                    <Text color={theme.status.success}>{glyphs().done}</Text>
                  </Box>
                )}
              </Box>
            )}
          />
        </Box>
        {sideHelp ? (
          <Box
            width="52%"
            borderStyle={glyphs().borderStyle}
            borderLeft
            borderRight={false}
            borderTop={false}
            borderBottom={false}
            borderColor={extendedTheme.ui.rule}
            paddingLeft={2}
            flexDirection="column"
            overflow="hidden"
          >
            <Text bold color={theme.text.primary} wrap="truncate-end">
              {highlighted?.label}
            </Text>
            <Box height={1} />
            <Text color={theme.text.secondary}>{highlighted?.description}</Text>
          </Box>
        ) : descriptionRows > 0 ? (
          <Box
            height={descriptionRows}
            paddingTop={descriptionRows >= 3 ? 1 : 0}
            flexDirection="column"
            overflow="hidden"
          >
            <Text
              color={theme.text.secondary}
              wrap={descriptionRows >= 2 ? 'wrap' : 'truncate-end'}
            >
              {highlighted?.description}
            </Text>
          </Box>
        ) : null}
      </Box>
      {warningRows > 0 && (
        <Box
          height={warningRows}
          flexShrink={0}
          flexDirection="column"
          overflow="hidden"
        >
          <Text
            color={theme.status.warning}
            wrap={warningRows > 1 ? 'wrap' : 'truncate-end'}
          >
            {warning}
          </Text>
        </Box>
      )}
      {footerRows > 0 && (
        <Box height={1} flexShrink={0}>
          <Box flexGrow={1} minWidth={0}>
            <Text color={extendedTheme.text.muted} wrap="truncate-end">
              {footer}
            </Text>
          </Box>
          <Box marginLeft={1} flexShrink={0}>
            <Text color={extendedTheme.text.muted}>
              {items.length ? highlightedIndex + 1 : 0}/{items.length}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
