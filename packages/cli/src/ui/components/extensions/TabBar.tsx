/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { theme } from '../../semantic-colors.js';
import { t } from '../../../i18n/index.js';
import {
  EXTENSIONS_TABS,
  type ExtensionsTab,
  type ExtensionsTabDef,
} from './types.js';

interface TabBarProps {
  tabs: ExtensionsTabDef[];
  activeTab: ExtensionsTab;
  /** When false, the "tab to cycle" hint is dimmed to signal it is locked. */
  canSwitch: boolean;
  availableWidth: number;
}

// Literal t() calls keep the labels extractable for translation.
function tabLabel(id: ExtensionsTab): string {
  switch (id) {
    case EXTENSIONS_TABS.DISCOVER:
      return t('Discover');
    case EXTENSIONS_TABS.INSTALLED:
      return t('Installed');
    case EXTENSIONS_TABS.SOURCES:
      return t('Sources');
    default:
      return id;
  }
}

export const TabBar = ({
  tabs,
  activeTab,
  canSwitch,
  availableWidth,
}: TabBarProps) => {
  const hint = t('(Tab / ←→ to switch)');
  const labelsWidth = tabs.reduce(
    (width, tab) => width + stringWidth(tabLabel(tab.id)) + 2,
    0,
  );
  const compact =
    availableWidth < labelsWidth + tabs.length * 2 + stringWidth(hint);
  return (
    <Box width={availableWidth}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Box
            key={tab.id}
            flexShrink={compact ? 1 : 0}
            marginRight={compact ? 0 : 2}
          >
            {isActive ? (
              <Text
                bold
                backgroundColor={theme.text.accent}
                color={theme.background.primary}
                wrap="truncate-end"
              >
                {` ${tabLabel(tab.id)} `}
              </Text>
            ) : (
              <Text
                color={theme.text.secondary}
                wrap="truncate-end"
              >{` ${tabLabel(tab.id)} `}</Text>
            )}
          </Box>
        );
      })}
      {!compact && (
        <Text
          color={theme.text.secondary}
          dimColor={!canSwitch}
          wrap="truncate-end"
        >
          {hint}
        </Text>
      )}
    </Box>
  );
};
