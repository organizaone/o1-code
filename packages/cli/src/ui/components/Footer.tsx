/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { type RefObject, useRef } from 'react';
import { type DOMElement, Box, Text, useBoxMetrics } from 'ink';
import { ApprovalMode } from '@organizaone/o1-code-core/config/approval-mode.js';
import { theme } from '../semantic-colors.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { ShellModeIndicator } from './ShellModeIndicator.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { atLeast, sideMargin } from '../utils/layout-tier.js';
import { useLayoutTier } from '../hooks/use-layout-tier.js';
import { useWorkingTreeDiff } from '../hooks/use-working-tree-diff.js';
import { MAX_STATUS_LINES, useStatusLine } from '../hooks/useStatusLine.js';
import { useConfigInitMessage } from '../hooks/useConfigInitMessage.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useVimModeState } from '../contexts/VimModeContext.js';
import { Spinner } from './RespondingSpinner.js';
import {
  GitZone,
  ModeZone,
  REASONING_DEFAULT,
  UsageZone,
} from './footer-zones.js';
import { getReasoningForDisplay } from '../../acp-integration/model-configuration.js';
import { resolveReasoningForModel } from '@organizaone/o1-code-core/core/reasoning-overrides.js';
import { t } from '../../i18n/index.js';
import { StreamingState } from '../types.js';
import type { Config } from '@organizaone/o1-code-core';

/**
 * The reasoning effort to show, `false` when off, `default` when the model
 * takes an effort but none was chosen, undefined when unknown.
 */
function readReasoning(config: Config): string | false | undefined {
  const generationConfig = config.getContentGeneratorConfig();
  if (!generationConfig) return undefined;
  try {
    const reasoning = getReasoningForDisplay(config, generationConfig);
    if (reasoning === false) return false;
    const effort = (reasoning as { effort?: string } | undefined)?.effort;
    if (effort) return effort;
    return resolveReasoningForModel(config, generationConfig)
      ? REASONING_DEFAULT
      : undefined;
  } catch {
    // A partial model configuration has no reasoning to show.
    return undefined;
  }
}

interface FooterProps {
  containerRef?: RefObject<DOMElement | null>;
}

export const Footer: React.FC<FooterProps> = ({ containerRef }) => {
  const uiState = useUIState();
  const config = useConfig();
  const settings = useSettings();
  const { vimEnabled, vimMode } = useVimModeState();
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const tier = useLayoutTier();
  const statusLineRef = useRef<DOMElement>(null);
  const { width: statusLineWidth, hasMeasured: hasMeasuredStatusLine } =
    useBoxMetrics(statusLineRef);
  const {
    lines: statusLineLines,
    useThemeColors,
    respectUserColors,
    hideContextIndicator,
  } = useStatusLine(
    isNarrow,
    hasMeasuredStatusLine ? statusLineWidth : undefined,
  );
  const configInitMessage = useConfigInitMessage(uiState.isConfigInitialized);
  const diff = useWorkingTreeDiff(config.getTargetDir());

  const promptTokenCount = uiState.sessionStats.lastPromptTokenCount;
  const generationConfig = config.getContentGeneratorConfig();
  const contextWindowSize = generationConfig?.contextWindowSize;
  const contextPercent =
    promptTokenCount > 0 && contextWindowSize && !hideContextIndicator
      ? (promptTokenCount / contextWindowSize) * 100
      : 0;
  const inTurn = uiState.streamingState !== StreamingState.Idle;
  const turnTokens =
    (uiState.responseCandidateTokens ?? 0) +
    Math.round((uiState.streamingResponseLengthRef?.current ?? 0) / 4);
  // "failed" while the stream shows a pending error, retries included; once a
  // retried request streams its answer it is online again.
  const requestStatus = !generationConfig
    ? 'none'
    : !uiState.isReceivingContent &&
        (uiState.pendingHistoryItems ?? []).some(
          (item) => item.type === 'error',
        )
      ? 'failed'
      : 'online';
  const worktreeBranch = settings.merged.ui?.hideBuiltinWorktreeIndicator
    ? undefined
    : uiState.activeWorktree?.branch;
  const branch = worktreeBranch ?? uiState.branchName;
  // Without a provider there is no model to name (spec §5.6).
  const model = generationConfig
    ? config.getModelDisplayName().replace(/^\[[^\]]+\]\s*/, '')
    : '—';

  // Short-lived notices take the whole row while they apply.
  const transientNotice = uiState.ctrlCPressedOnce ? (
    <Text color={theme.status.warning}>{t('Press Ctrl+C again to exit.')}</Text>
  ) : uiState.ctrlDPressedOnce ? (
    <Text color={theme.status.warning}>{t('Press Ctrl+D again to exit.')}</Text>
  ) : uiState.showEscapePrompt ? (
    <Text color={theme.text.secondary}>{t('Press Esc again to clear.')}</Text>
  ) : uiState.rewindEscPending ? (
    <Text color={theme.text.secondary}>
      {t('Press Esc again to rewind conversation.')}
    </Text>
  ) : null;

  // Lasting states (vim, shell, startup) replace the first zone only, so the
  // footer's other zones stay visible for as long as they last.
  const lastingState =
    vimEnabled && vimMode === 'INSERT' ? (
      <Text color={theme.text.secondary}>-- INSERT --</Text>
    ) : vimEnabled && vimMode === 'NORMAL' ? (
      <Text color={theme.text.secondary}>-- NORMAL --</Text>
    ) : uiState.shellModeActive ? (
      <ShellModeIndicator />
    ) : configInitMessage ? (
      <Text color={theme.text.secondary}>
        <Spinner /> {configInitMessage}
      </Text>
    ) : uiState.startupIdeConnectionStatus.state === 'connecting' ? (
      <Text color={theme.text.secondary}>
        <Spinner /> {t('IDE connecting... context may be unavailable')}
      </Text>
    ) : uiState.startupIdeConnectionStatus.state === 'failed' ? (
      <Text color={theme.status.warning}>
        {t('IDE connection unavailable: {{message}}', {
          message: uiState.startupIdeConnectionStatus.message,
        })}
      </Text>
    ) : null;

  const showStatusLine =
    statusLineLines.length > 0 &&
    !uiState.ctrlCPressedOnce &&
    !uiState.ctrlDPressedOnce;

  // A transient notice takes the whole row: cut short it loses its meaning.
  if (transientNotice) {
    return (
      <Box ref={containerRef} width="100%" paddingX={sideMargin(tier)}>
        <Text wrap="truncate">{transientNotice}</Text>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      width="100%"
      paddingX={sideMargin(tier)}
      justifyContent="space-between"
    >
      <Box flexShrink={showStatusLine ? 0 : 1} minWidth={0}>
        {lastingState ? (
          <Text wrap="truncate">{lastingState}</Text>
        ) : (
          <ModeZone
            tier={tier}
            mode={uiState.showAutoAcceptIndicator ?? ApprovalMode.DEFAULT}
            model={model}
            reasoning={readReasoning(config)}
            safeMode={config.isSafeMode()}
            debugMode={config.getDebugMode()}
          />
        )}
      </Box>
      {atLeast(tier, 'medium') && (
        <Box flexShrink={1} minWidth={0} marginX={1}>
          <GitZone branch={branch} diff={diff} />
        </Box>
      )}
      {showStatusLine ? (
        // A custom status line replaces the usage zone and takes the room left.
        <Box
          ref={statusLineRef}
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          flexDirection="column"
          alignItems="flex-end"
          maxHeight={MAX_STATUS_LINES}
          overflow="hidden"
        >
          <Text
            color={
              respectUserColors
                ? undefined
                : useThemeColors
                  ? theme.text.accent
                  : undefined
            }
            dimColor={respectUserColors ? false : !useThemeColors}
            wrap="wrap"
          >
            {statusLineLines.join('\n')}
          </Text>
        </Box>
      ) : (
        <Box flexShrink={0}>
          <UsageZone
            tier={tier}
            contextPercent={contextPercent}
            tokens={inTurn ? turnTokens : undefined}
            // The whole turn, approvals included, on the same base as its
            // tokens; the loading timer starts over after each approval.
            turnStartedAt={inTurn ? uiState.turnStartedAt : undefined}
            status={requestStatus}
          />
        </Box>
      )}
    </Box>
  );
};
