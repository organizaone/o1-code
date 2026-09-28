/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { Header } from './Header.js';
import { WelcomeScreen } from './WelcomeScreen.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useSystemMemory } from '../hooks/use-system-memory.js';
import { useMCPHealth } from '../hooks/useMCPHealth.js';
import { useLogoAnimation } from '../hooks/use-logo-animation.js';
import { BRAND } from '../../generated/brand.js';

interface AppHeaderProps {
  version: string;
  /**
   * Pinned at the top in full-screen mode: the header then draws the blank
   * rows above and below itself, and the logo may animate in the upper one.
   */
  pinned?: boolean;
}

export const AppHeader = ({ version, pinned = false }: AppHeaderProps) => {
  const config = useConfig();
  const uiState = useUIState();
  const { columns } = useTerminalSize();
  const memory = useSystemMemory();
  const mcp = useMCPHealth();
  const logoAnimation = useLogoAnimation(pinned);
  if (config.getScreenReader()) return pinned ? <Box height={2} /> : null;
  const header = (
    <Header
      columns={columns}
      version={version}
      organization={BRAND.organization}
      workingDirectory={config.getTargetDir()}
      memory={memory}
      updateVersion={uiState.updateInfo?.update?.latest}
      mcpOfflineCount={mcp.disconnectedCount}
      logoAnimation={logoAnimation}
    />
  );
  if (!pinned) return header;
  // While the logo animates, its first row is the blank row above the header.
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      paddingTop={logoAnimation ? 0 : 1}
    >
      {header}
      <Box height={1} />
    </Box>
  );
};

/** The startup tip, shown at the top of the conversation. */
export const AppTips = () => {
  const settings = useSettings();
  const config = useConfig();
  if (settings.merged.ui?.hideTips || config.getScreenReader()) return null;
  // The start screen of spec §6.1 takes the place of the old startup tip.
  return (
    <WelcomeScreen
      currentSessionId={config.getSessionId()}
      cwd={config.getTargetDir()}
    />
  );
};
