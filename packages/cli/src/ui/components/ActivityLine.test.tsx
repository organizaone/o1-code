/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { ActivityChips, ActivityLine, planProgress } from './ActivityLine.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import { StreamingState } from '../types.js';
import { GitZone } from './footer-zones.js';

vi.mock('./background-view/BackgroundTasksPill.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('./background-view/BackgroundTasksPill.js')
  >()),
  BackgroundTasksPill: () => null,
}));
vi.mock('./GoalPill.js', () => ({
  GoalPill: () => <Text>GOAL</Text>,
  isLiveGoalSnapshot: () => false,
  useFooterGoalState: () => undefined,
}));
vi.mock('./CronPill.js', () => ({
  CronPill: ({ count }: { count: number }) => (
    <Text>{`${count} scheduled`}</Text>
  ),
  useFooterCronTaskCount: () => 2,
}));
vi.mock('../hooks/use-layout-tier.js', () => ({
  useLayoutTier: () => 'full',
}));

const VS15 = String.fromCharCode(0xfe0e);
const text = (node: React.ReactElement) =>
  stripAnsi(render(node).lastFrame() ?? '').replaceAll(VS15, '');

describe('ActivityChips', () => {
  it('shows the five categories', () => {
    expect(text(<ActivityChips tier="full" active="execute" />)).toBe(
      '● info  ● reading  ● writing  ● running  ● done',
    );
  });

  it('adds a monitoring chip while monitors watch', () => {
    expect(
      text(<ActivityChips tier="full" active="read" monitoring={2} />),
    ).toBe('● info  ● reading  ● writing  ● running  ● done  ● monitoring (2)');
  });

  it('keeps only the active label under 80 columns', () => {
    expect(text(<ActivityChips tier="minimal" active="read" />)).toBe(
      '● ● reading ● ● ●',
    );
  });
});

describe('planProgress', () => {
  it('counts completed items of the plan', () => {
    expect(
      planProgress([
        { status: 'completed' },
        { status: 'in_progress' },
        { status: 'pending' },
      ]),
    ).toEqual({ done: 1, total: 3 });
    expect(planProgress(null)).toBeNull();
    expect(planProgress([])).toBeNull();
  });
});

describe('ActivityLine', () => {
  it('shows plan, schedule, review and workflow on the right', () => {
    const uiState = {
      pendingHistoryItems: [],
      streamingState: StreamingState.Responding,
      stickyTodos: [
        { id: '1', content: 'a', status: 'completed' },
        { id: '2', content: 'b', status: 'pending' },
      ],
      isSkillReviewDialogOpen: false,
      skillReviewPending: { taskId: 't', skills: [{ name: 's' }] },
      workflowKeywordActive: true,
    } as unknown as UIState;
    const frame = text(
      <Box width={200}>
        <UIStateContext.Provider value={uiState}>
          <ActivityLine />
        </UIStateContext.Provider>
      </Box>,
    );
    expect(frame).toContain('info');
    expect(frame).toContain('plan 1/2');
    expect(frame).toContain('2 scheduled');
    expect(frame).toContain('pending review');
    expect(frame).toContain('workflow active');
  });

  it('shows the skill the running turn loaded', () => {
    const uiState = {
      history: [{ id: 1, type: 'user', text: 'ship it' }],
      pendingHistoryItems: [
        {
          type: 'tool_group',
          tools: [
            {
              callId: 'c',
              name: 'Skill',
              description: 'build-release',
              status: 'Success',
              args: { skill: 'build-release' },
            },
          ],
        },
      ],
      streamingState: StreamingState.Responding,
      stickyTodos: null,
      isSkillReviewDialogOpen: false,
      skillReviewPending: null,
      workflowKeywordActive: false,
    } as unknown as UIState;
    const frame = text(
      <Box width={200}>
        <UIStateContext.Provider value={uiState}>
          <ActivityLine />
        </UIStateContext.Provider>
      </Box>,
    );
    expect(frame).toContain('● build-release');
  });

  it('stays on one row at 80 columns with every indicator on', () => {
    const uiState = {
      pendingHistoryItems: [],
      streamingState: StreamingState.Responding,
      stickyTodos: [{ id: '1', content: 'a', status: 'pending' }],
      isSkillReviewDialogOpen: false,
      skillReviewPending: { taskId: 't', skills: [{ name: 's' }] },
      workflowKeywordActive: true,
    } as unknown as UIState;
    const frame = text(
      <Box width={80}>
        <UIStateContext.Provider value={uiState}>
          <ActivityLine />
        </UIStateContext.Provider>
      </Box>,
    );
    expect(frame.split('\n')).toHaveLength(1);
  });
});

describe('GitZone in a narrow box', () => {
  it('truncates a long branch name instead of wrapping', () => {
    const frame = text(
      <Box width={30}>
        <GitZone branch={'feature/' + 'x'.repeat(60)} diff={null} />
      </Box>,
    );
    expect(frame.split('\n')).toHaveLength(1);
  });
});
