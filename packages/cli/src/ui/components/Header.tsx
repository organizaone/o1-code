/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { tildeifyPath } from '@organizaone/o1-code-core/utils/paths.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';
import { t } from '../../i18n/index.js';
import { formatVersionLabel } from '../../utils/version.js';
import { getCachedStringWidth } from '../utils/textUtils.js';
import {
  atLeast,
  getLayoutTier,
  sideMargin,
  type LayoutTier,
} from '../utils/layout-tier.js';
import { fitPath } from '../utils/fit-path.js';
import {
  formatMemory,
  memoryFraction,
  type SystemMemory,
} from '../hooks/use-system-memory.js';
import { O1Logo, O1Wordmark } from './O1Logo.js';
import { AnimatedLogo, type AnimatedLogoProps } from './AnimatedLogo.js';

export interface HeaderProps {
  columns: number;
  version: string;
  organization: string;
  workingDirectory: string;
  memory: SystemMemory;
  updateVersion?: string;
  mcpOfflineCount: number;
  /**
   * Animates the logo. The header then also draws the blank row above it,
   * which the animation uses, so it is one row taller.
   */
  logoAnimation?: AnimatedLogoProps;
}

const SEP = ' · ';
const MEMORY_BAR_CELLS = 8;

export function getHeaderRows(columns: number): number {
  return getLayoutTier(columns) === 'minimal' ? 3 : 4;
}

/** Rows the pinned header takes, including the blank rows above and below it. */
export function getFixedHeaderHeight(columns: number): number {
  return getHeaderRows(columns) + 2;
}

function hintItems(tier: LayoutTier): Array<[string, string]> {
  const items: Array<[string, string]> = [
    ['esc', t('cancel')],
    ['shift+tab', t('mode')],
    ['/', t('commands')],
  ];
  if (atLeast(tier, 'medium')) items.push(['@', t('files')]);
  if (atLeast(tier, 'full')) items.push(['ctrl+c', t('quit')]);
  return items;
}

const hintsWidth = (items: Array<[string, string]>): number =>
  items.reduce(
    (sum, [key, label], i) =>
      sum + (i > 0 ? SEP.length : 0) + getCachedStringWidth(`${key} ${label}`),
    0,
  );

const Hints = ({ items }: { items: Array<[string, string]> }) => (
  <Text color={extendedTheme.text.muted}>
    {items.map(([key, label], i) => (
      <Text key={key}>
        {i > 0 && <Text color={extendedTheme.ui.separator}>{SEP}</Text>}
        <Text color={theme.text.secondary}>{key}</Text>
        {` ${label}`}
      </Text>
    ))}
  </Text>
);

const MemoryBar = ({ memory }: { memory: SystemMemory }) => {
  const full = Math.round(memoryFraction(memory) * MEMORY_BAR_CELLS);
  return (
    <Text>
      {' '}
      <Text color={theme.text.accent}>{glyphs().barFull.repeat(full)}</Text>
      <Text color={extendedTheme.ui.separator}>
        {glyphs().barEmpty.repeat(MEMORY_BAR_CELLS - full)}
      </Text>
    </Text>
  );
};

const Notices = ({
  tier,
  updateVersion,
  mcpOfflineCount,
}: {
  tier: LayoutTier;
  updateVersion?: string;
  mcpOfflineCount: number;
}) => {
  const wide = atLeast(tier, 'compact');
  const version = updateVersion ? formatVersionLabel(updateVersion) : '';
  const mcpLabel = !wide
    ? 'MCP'
    : t(
        mcpOfflineCount === 1
          ? '{{count}} MCP offline'
          : '{{count}} MCPs offline',
        { count: String(mcpOfflineCount) },
      );
  return (
    <Text>
      {updateVersion && (
        <Text color={extendedTheme.ui.brandSoft}>
          {`${glyphs().up} ${wide ? t('{{version}} available', { version }) : version} · `}
          <Text color={extendedTheme.text.muted}>/update</Text>
        </Text>
      )}
      {updateVersion && mcpOfflineCount > 0 && '   '}
      {mcpOfflineCount > 0 && (
        <Text color={theme.status.warning}>
          {`${glyphs().dot} ${mcpLabel} · `}
          <Text color={extendedTheme.text.muted}>/mcp</Text>
        </Text>
      )}
    </Text>
  );
};

const PathText = ({ path, room }: { path: string; room: number }) => {
  const { parent, name } = fitPath(path, room);
  return (
    <Text>
      <Text color={extendedTheme.text.muted}>{parent}</Text>
      <Text color={theme.text.primary} bold>
        {name}
      </Text>
    </Text>
  );
};

export const Header: React.FC<HeaderProps> = ({
  columns,
  version,
  organization,
  workingDirectory,
  memory,
  updateVersion,
  mcpOfflineCount,
  logoAnimation,
}) => {
  const tier = getLayoutTier(columns);
  const marginX = sideMargin(tier);
  const width = Math.max(0, columns - marginX * 2);
  const path =
    process.platform === 'win32'
      ? workingDirectory
      : tildeifyPath(workingDirectory);
  const versionText = (
    <Text bold color={extendedTheme.text.muted}>
      {`${formatVersionLabel(version)} · ${organization.toUpperCase()}`}
    </Text>
  );
  const notices = (
    <Notices
      tier={tier}
      updateVersion={updateVersion}
      mcpOfflineCount={mcpOfflineCount}
    />
  );
  const row = (key: string, left: React.ReactNode, right: React.ReactNode) => (
    <Box key={key} height={1} width={width} justifyContent="space-between">
      <Box flexShrink={1}>{left ?? <Text> </Text>}</Box>
      <Box flexShrink={0}>{right}</Box>
    </Box>
  );

  if (tier === 'minimal') {
    return (
      <Box flexDirection="column" marginX={marginX} width={width}>
        {row('logo', <O1Wordmark />, versionText)}
        {row('notices', null, notices)}
        {row('path', null, <PathText path={path} room={width} />)}
      </Box>
    );
  }

  // Drop whole hints from the end until the folder name fits beside them.
  const hints = hintItems(tier);
  const folderWidth = getCachedStringWidth(fitPath(path, 0).name);
  while (hints.length > 0 && hintsWidth(hints) + 3 + folderWidth > width) {
    hints.pop();
  }
  return (
    <Box flexDirection="column" marginX={marginX} width={width}>
      <Box width={width} justifyContent="space-between">
        {logoAnimation ? <AnimatedLogo {...logoAnimation} /> : <O1Logo />}
        <Box flexDirection="column" alignItems="flex-end" flexShrink={0}>
          {logoAnimation && <Text> </Text>}
          {versionText}
          <Text color={extendedTheme.text.muted}>
            {`${t('memory')} `}
            <Text color={theme.text.primary}>{formatMemory(memory)}</Text>
            {atLeast(tier, 'medium') && <MemoryBar memory={memory} />}
          </Text>
        </Box>
      </Box>
      {row('notices', null, notices)}
      {row(
        'hints',
        <Hints items={hints} />,
        <PathText
          path={path}
          room={hints.length > 0 ? width - hintsWidth(hints) - 3 : width}
        />,
      )}
    </Box>
  );
};
