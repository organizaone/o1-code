/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';
import { t } from '../../i18n/index.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useLayoutTier } from '../hooks/use-layout-tier.js';
import { atLeast, sideMargin, type LayoutTier } from '../utils/layout-tier.js';
import {
  CATEGORY_LABELS,
  getActivityCategory,
  type ActivityCategory,
} from '../utils/activity-category.js';
import { getActiveSkill } from '../utils/active-skill.js';
import {
  BackgroundTasksPill,
  countRunningMonitors,
} from './background-view/BackgroundTasksPill.js';
import { useBackgroundTaskViewState } from '../contexts/BackgroundTaskViewContext.js';
import {
  GoalPill,
  isLiveGoalSnapshot,
  useFooterGoalState,
} from './GoalPill.js';
import { CronPill, useFooterCronTaskCount } from './CronPill.js';

const CATEGORIES = Object.entries(CATEGORY_LABELS) as ReadonlyArray<
  [ActivityCategory, string]
>;

export function planProgress(
  todos: ReadonlyArray<{ status: string }> | null,
): { done: number; total: number } | null {
  if (!todos || todos.length === 0) return null;
  return {
    done: todos.filter((todo) => todo.status === 'completed').length,
    total: todos.length,
  };
}

export const ActivityChips: React.FC<{
  tier: LayoutTier;
  active: ActivityCategory | null;
  /** Monitors still watching; a `monitoring` chip follows the categories. */
  monitoring?: number;
  /** The chip holds the background-tasks focus (↑ from the composer). */
  monitoringFocused?: boolean;
}> = ({ tier, active, monitoring = 0, monitoringFocused = false }) => {
  const wide = atLeast(tier, 'compact');
  return (
    <Text wrap="truncate">
      {CATEGORIES.map(([category, label], i) => {
        const on = category === active;
        return (
          <Text key={category}>
            {i > 0 && (wide ? '  ' : ' ')}
            <Text
              color={
                on
                  ? extendedTheme.activity[category]
                  : extendedTheme.ui.separator
              }
            >
              {glyphs().dot}
            </Text>
            {(on || wide) && (
              <Text
                color={on ? theme.text.primary : extendedTheme.text.muted}
                bold={on}
              >
                {` ${t(label)}`}
              </Text>
            )}
          </Text>
        );
      })}
      {monitoring > 0 && (
        <Text>
          {wide ? '  ' : ' '}
          <Text color={extendedTheme.ui.brandSoft}>{glyphs().dot}</Text>
          <Text
            color={extendedTheme.ui.brandSoft}
            bold
            inverse={monitoringFocused}
          >
            {` ${t('monitoring ({{count}})', { count: String(monitoring) })}`}
          </Text>
        </Text>
      )}
    </Text>
  );
};

const Sep = () => <Text color={extendedTheme.ui.separator}>{' · '}</Text>;

export const ActivityLine: React.FC = () => {
  const uiState = useUIState();
  const tier = useLayoutTier();
  const goal = useFooterGoalState();
  const cronCount = useFooterCronTaskCount();
  const active = getActivityCategory(
    uiState.pendingHistoryItems,
    uiState.streamingState,
  );
  const plan = planProgress(uiState.stickyTodos);
  const { entries: backgroundEntries, pillFocused } =
    useBackgroundTaskViewState();
  const monitoring = countRunningMonitors(backgroundEntries);
  // The skill leaves the line below 100 columns, before the indicators the
  // product already had (spec §8).
  const skill = atLeast(tier, 'medium')
    ? getActiveSkill(
        uiState.history ?? [],
        uiState.pendingHistoryItems,
        uiState.streamingState,
        uiState.turnStartHistoryIndex,
      )
    : null;
  const reviewCount = uiState.isSkillReviewDialogOpen
    ? 0
    : (uiState.skillReviewPending?.skills.length ?? 0);
  return (
    <Box
      width="100%"
      paddingX={sideMargin(tier)}
      justifyContent="space-between"
      // One blank row below the chips: right above the input they read as
      // part of the box rather than as the conversation's status.
      marginBottom={1}
    >
      <Box flexShrink={1} minWidth={0}>
        <ActivityChips
          tier={tier}
          active={active}
          monitoring={monitoring}
          monitoringFocused={pillFocused && monitoring > 0}
        />
      </Box>
      <Box flexShrink={1} minWidth={0} marginLeft={1}>
        <Text color={extendedTheme.text.muted} wrap="truncate">
          <BackgroundTasksPill />
          {plan && (
            <>
              <Sep />
              {`${t('plan')} `}
              <Text color={theme.text.primary} bold>
                {`${plan.done}/${plan.total}`}
              </Text>
            </>
          )}
          {skill && (
            <>
              <Sep />
              <Text color={extendedTheme.ui.brandSoft} bold>
                {`${glyphs().dot} ${skill}`}
              </Text>
            </>
          )}
          {isLiveGoalSnapshot(goal) && (
            <>
              <Sep />
              <GoalPill snapshot={goal} />
            </>
          )}
          {cronCount > 0 && (
            <>
              <Sep />
              <CronPill count={cronCount} />
            </>
          )}
          {reviewCount > 0 && (
            <>
              <Sep />
              <Text color={theme.status.warning}>
                {t('{{count}} skill(s) pending review', {
                  count: String(reviewCount),
                })}
              </Text>
            </>
          )}
          {uiState.workflowKeywordActive && (
            <>
              <Sep />
              <Text color={theme.text.accent}>{t('workflow active')}</Text>
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
};
