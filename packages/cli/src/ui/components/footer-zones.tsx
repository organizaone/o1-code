/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { ApprovalMode } from '@organizaone/o1-code-core/config/approval-mode.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';
import { t } from '../../i18n/index.js';
import { atLeast, type LayoutTier } from '../utils/layout-tier.js';
import type { WorkingTreeDiff } from '../hooks/use-working-tree-diff.js';
import { useSecondsSince } from '../hooks/use-turn-clock.js';

const SEP = ' · ';
const CONTEXT_BAR_CELLS = 6;

export function formatTurnTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export function formatTokens(tokens: number): string {
  return tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}k`;
}

export function modeLabel(mode: ApprovalMode): string {
  switch (mode) {
    case ApprovalMode.PLAN:
      return t('PLAN');
    case ApprovalMode.AUTO_EDIT:
      return t('EDITS');
    case ApprovalMode.AUTO:
      return t('AUTO');
    case ApprovalMode.YOLO:
      return t('YOLO');
    default:
      return t('DEFAULT');
  }
}

function modeColor(mode: ApprovalMode): string {
  switch (mode) {
    case ApprovalMode.AUTO_EDIT:
      return theme.status.warning;
    case ApprovalMode.YOLO:
      return theme.status.error;
    case ApprovalMode.PLAN:
      return theme.status.success;
    default:
      return extendedTheme.ui.brandSoft;
  }
}

const Sep = () => <Text color={extendedTheme.ui.separator}>{SEP}</Text>;

/** A model that takes an effort, running on the one its provider picks. */
export const REASONING_DEFAULT = 'default';

export const ModeZone: React.FC<{
  tier: LayoutTier;
  mode: ApprovalMode;
  model: string;
  reasoning?: string | false;
  safeMode?: boolean;
  debugMode?: boolean;
}> = ({ tier, mode, model, reasoning, safeMode, debugMode }) => {
  const reasoningText =
    reasoning === undefined || !atLeast(tier, 'compact')
      ? ''
      : reasoning === false
        ? t('reasoning off')
        : reasoning === REASONING_DEFAULT
          ? t('reasoning default')
          : atLeast(tier, 'medium')
            ? t('reasoning {{effort}}', { effort: t(reasoning) })
            : t(reasoning);
  return (
    <Text color={extendedTheme.text.muted} wrap="truncate">
      <Text color={modeColor(mode)} bold>
        {`${glyphs().dot} ${modeLabel(mode)}`}
      </Text>
      <Text color={extendedTheme.ui.separator}>{' │ '}</Text>
      <Text color={theme.text.primary}>{model}</Text>
      {reasoningText && (
        <>
          <Sep />
          {reasoningText}
        </>
      )}
      {safeMode && (
        <>
          <Sep />
          <Text color={theme.status.warning}>Safe Mode</Text>
        </>
      )}
      {debugMode && (
        <>
          <Sep />
          <Text color={theme.status.warning}>Debug Mode</Text>
        </>
      )}
    </Text>
  );
};

export const GitZone: React.FC<{
  branch?: string;
  diff: WorkingTreeDiff | null;
}> = ({ branch, diff }) =>
  branch ? (
    <Text wrap="truncate">
      <Text
        color={theme.text.accent}
      >{`${glyphs().branchPrefix}${branch}`}</Text>
      {diff && (diff.linesAdded > 0 || diff.linesRemoved > 0) && (
        <>
          {' '}
          <Text color={theme.status.success}>{`+${diff.linesAdded}`}</Text>{' '}
          <Text color={theme.status.error}>{`-${diff.linesRemoved}`}</Text>
        </>
      )}
    </Text>
  ) : null;

/** The turn time; ticks on its own so the rest of the app does not redraw. */
const TurnTime: React.FC<{ startedAt?: number }> = ({ startedAt }) => {
  const seconds = useSecondsSince(startedAt);
  return <>{seconds === undefined ? '—' : formatTurnTime(seconds)}</>;
};

export const UsageZone: React.FC<{
  tier: LayoutTier;
  contextPercent: number;
  tokens?: number;
  turnStartedAt?: number;
  status: 'online' | 'failed' | 'none';
}> = ({ tier, contextPercent, tokens, turnStartedAt, status }) => {
  const wide = atLeast(tier, 'compact');
  const percent = Math.min(100, Math.max(0, contextPercent));
  const full = Math.round((percent / 100) * CONTEXT_BAR_CELLS);
  const statusNode =
    status === 'failed' ? (
      <Text color={theme.status.error}>
        {`${glyphs().dot}${wide ? ` ${t('failed')}` : ''}`}
      </Text>
    ) : status === 'none' ? (
      <Text color={extendedTheme.text.muted}>
        {`${glyphs().hollow}${wide ? ` ${t('no provider')}` : ''}`}
      </Text>
    ) : (
      <Text color={theme.status.success}>
        {`${glyphs().dot}${wide ? ` ${t('online')}` : ''}`}
      </Text>
    );
  return (
    <Text color={extendedTheme.text.muted}>
      {atLeast(tier, 'full') && (
        <>
          <Text color={extendedTheme.ui.brand}>
            {glyphs().barFull.repeat(full)}
          </Text>
          <Text color={extendedTheme.ui.separator}>
            {glyphs().barEmpty.repeat(CONTEXT_BAR_CELLS - full)}
          </Text>{' '}
        </>
      )}
      {`${Math.round(contextPercent)}% ctx`}
      {wide && (
        <>
          <Sep />
          {tokens === undefined ? (
            '— tok'
          ) : (
            <>
              <Text color={theme.text.primary}>{formatTokens(tokens)}</Text>
              {' tok'}
            </>
          )}
        </>
      )}
      <Sep />
      <TurnTime startedAt={turnStartedAt} />
      <Sep />
      {statusNode}
    </Text>
  );
};
