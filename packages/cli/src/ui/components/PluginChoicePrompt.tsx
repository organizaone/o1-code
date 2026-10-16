/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useState, useCallback } from 'react';
import wrapAnsi from 'wrap-ansi';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { glyphs } from '../glyphs.js';
import { theme } from '../semantic-colors.js';
import { t } from '../../i18n/index.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';

interface PluginChoice {
  name: string;
  description?: string;
}

type PluginChoicePromptProps = {
  marketplaceName: string;
  plugins: PluginChoice[];
  onSelect: (pluginName: string) => void;
  onCancel: () => void;
  terminalWidth: number;
  availableTerminalHeight?: number;
};

// Maximum number of visible items in the list
const MAX_VISIBLE_ITEMS = 8;

export const PluginChoicePrompt = (props: PluginChoicePromptProps) => {
  const { marketplaceName, plugins, onSelect, onCancel } = props;

  const [selectedIndex, setSelectedIndex] = useState(0);

  const [descriptionOffset, setDescriptionOffset] = useState(0);
  const [descriptionActive, setDescriptionActive] = useState(false);
  const { rows } = useTerminalSize();
  const budget = Math.max(
    1,
    Math.floor(props.availableTerminalHeight ?? rows - 2),
  );
  const showFrame = budget >= 5;
  const showTitle = budget >= 8;
  const showFooter = budget >= 5;
  const gap = budget >= 12 ? 1 : 0;
  const bodyRows =
    budget -
    Number(showFrame) * 2 -
    Number(showTitle) -
    Number(showFooter) -
    gap * 2;
  const descriptionWidth = Math.max(
    1,
    props.terminalWidth - (showFrame ? 8 : 2),
  );
  const descriptionLines = wrapAnsi(
    plugins[selectedIndex]?.description ?? '',
    descriptionWidth,
    { hard: true, trim: false },
  ).split('\n');
  const descriptionRows = plugins[selectedIndex]?.description
    ? Math.min(
        descriptionLines.length,
        Math.max(1, Math.floor((bodyRows - 1) / 2)),
      )
    : 0;
  const descriptionScrolls =
    descriptionRows > 0 && descriptionLines.length > descriptionRows;
  const hintRows = Number(descriptionScrolls && bodyRows >= 5);
  const nameRows = Math.max(1, bodyRows - descriptionRows - hintRows);
  const indicatorRows =
    nameRows >= 3 && plugins.length > Math.min(MAX_VISIBLE_ITEMS, nameRows)
      ? 2
      : 0;
  const visibleCount = Math.min(
    MAX_VISIBLE_ITEMS,
    Math.max(1, nameRows - indicatorRows),
  );
  const startIndex = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(visibleCount / 2),
      plugins.length - visibleCount,
    ),
  );
  const visiblePlugins = plugins.slice(startIndex, startIndex + visibleCount);
  const hasLess = startIndex > 0;
  const hasMore = startIndex + visiblePlugins.length < plugins.length;
  const maxDescriptionOffset = Math.max(
    0,
    descriptionLines.length - descriptionRows,
  );
  const visibleDescriptionOffset = Math.min(
    descriptionOffset,
    maxDescriptionOffset,
  );

  const handleKeypress = useCallback(
    (key: Key) => {
      const { name, sequence } = key;

      if (name === 'escape') {
        onCancel();
        return;
      }

      if (name === 'return') {
        const plugin = plugins[selectedIndex];
        if (plugin) {
          onSelect(plugin.name);
        }
        return;
      }

      if (keyMatchers[Command.PAGE_UP](key)) {
        setDescriptionActive(true);
        setDescriptionOffset(
          Math.max(0, visibleDescriptionOffset - Math.max(1, descriptionRows)),
        );
        return;
      }
      if (keyMatchers[Command.PAGE_DOWN](key)) {
        setDescriptionActive(true);
        setDescriptionOffset(
          Math.min(
            maxDescriptionOffset,
            budget === 1 && !descriptionActive
              ? 0
              : visibleDescriptionOffset + Math.max(1, descriptionRows),
          ),
        );
        return;
      }

      // Navigate up
      if (keyMatchers[Command.SELECTION_UP](key)) {
        if (plugins.length === 0) return;
        setDescriptionOffset(0);
        setDescriptionActive(false);
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : plugins.length - 1));
        return;
      }

      // Navigate down
      if (keyMatchers[Command.SELECTION_DOWN](key)) {
        if (plugins.length === 0) return;
        setDescriptionOffset(0);
        setDescriptionActive(false);
        setSelectedIndex((prev) => (prev < plugins.length - 1 ? prev + 1 : 0));
        return;
      }

      // Number shortcuts (1-9)
      const num = parseInt(sequence || '', 10);
      if (!isNaN(num) && num >= 1 && num <= plugins.length && num <= 9) {
        setSelectedIndex(num - 1);
        const plugin = plugins[num - 1];
        if (plugin) {
          onSelect(plugin.name);
        }
      }
    },
    [
      plugins,
      selectedIndex,
      onSelect,
      onCancel,
      visibleDescriptionOffset,
      descriptionRows,
      maxDescriptionOffset,
      budget,
      descriptionActive,
    ],
  );

  useKeypress(handleKeypress, { isActive: true });

  // With one row, paging temporarily uses the selection row for its description.
  if (budget === 1 && descriptionActive && descriptionRows > 0) {
    return (
      <Box width={props.terminalWidth} height={1}>
        <Text color={theme.text.primary} wrap="truncate-end">
          {descriptionLines[visibleDescriptionOffset]}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      borderStyle={showFrame ? glyphs().borderStyle : undefined}
      borderColor={theme.border.focused}
      flexDirection="column"
      paddingX={showFrame ? 2 : 0}
      width={props.terminalWidth}
      flexShrink={0}
    >
      {showTitle && (
        <Text bold color={theme.text.primary} wrap="truncate-end">
          {t('Select a plugin from "{{name}}"', { name: marketplaceName })}
        </Text>
      )}

      <Box marginTop={gap} flexDirection="column" flexShrink={0}>
        {/* Show "more items above" indicator */}
        {indicatorRows > 0 && hasLess && (
          <Box>
            <Text dimColor wrap="truncate-end">
              {' '}
              ↑ {t('{{count}} more above', { count: String(startIndex) })}
            </Text>
          </Box>
        )}

        {visiblePlugins.map((plugin, visibleIndex) => {
          const actualIndex = startIndex + visibleIndex;
          const isSelected = actualIndex === selectedIndex;
          const prefix = isSelected ? `${glyphs().prompt} ` : '  ';

          return (
            <Box key={plugin.name} flexDirection="column">
              <Box flexDirection="row" height={1}>
                <Text color={isSelected ? theme.border.focused : undefined}>
                  {prefix}
                </Text>
                <Text
                  wrap="truncate-end"
                  bold={isSelected}
                  color={isSelected ? theme.text.primary : theme.text.secondary}
                >
                  {plugin.name.replace(/[\r\n]/g, ' ')}
                </Text>
              </Box>
              {/* Show full description only for selected item */}
              {isSelected && budget > 1 && descriptionRows > 0 && (
                <Box marginLeft={2} flexDirection="column">
                  <Text color={theme.text.secondary}>
                    {descriptionLines
                      .slice(
                        visibleDescriptionOffset,
                        visibleDescriptionOffset + descriptionRows,
                      )
                      .join('\n')}
                  </Text>
                  {hintRows > 0 && (
                    <Text dimColor wrap="truncate-end">
                      {visibleDescriptionOffset + 1}–
                      {visibleDescriptionOffset + descriptionRows}/
                      {descriptionLines.length}{' '}
                      {t('PgUp/PgDn scroll description')}
                    </Text>
                  )}
                </Box>
              )}
            </Box>
          );
        })}

        {/* Show "more items below" indicator */}
        {indicatorRows > 0 && hasMore && (
          <Box>
            <Text dimColor wrap="truncate-end">
              {' '}
              ↓{' '}
              {t('{{count}} more below', {
                count: String(
                  plugins.length - startIndex - visiblePlugins.length,
                ),
              })}
            </Text>
          </Box>
        )}
      </Box>

      {showFooter && (
        <Box
          marginTop={gap}
          flexDirection="row"
          gap={1}
          height={1}
          flexShrink={0}
        >
          <Text dimColor wrap="truncate-end">
            {t(
              '↑↓ navigate · Enter select · Escape cancel · PgUp/PgDn description',
            )}
          </Text>
          {plugins.length > visibleCount && (
            <Text dimColor>
              ({selectedIndex + 1}/{plugins.length})
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};
