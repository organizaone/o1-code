/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import wrapAnsi from 'wrap-ansi';
import type { AgentTask } from '@organizaone/o1-code-core/agents/background-tasks.js';
import type { DialogEntry } from '../../hooks/useBackgroundTaskView.js';
import { compareActiveThenTerminal } from '../../hooks/useBackgroundTaskView.js';
import { localizeToolDisplayName, t } from '../../../i18n/index.js';
import { TOOL_DISPLAY_BY_NAME } from '../../utils/tool-display-map.js';
import { formatDuration, formatTokenCount } from '../../utils/formatters.js';
import {
  sanitizeMultilineForDisplay,
  truncateToWidth,
} from '../../utils/textUtils.js';
import { ancestorChain } from './agent-forest.js';
import { glyphs } from '../../glyphs.js';

export const AGENT_DASHBOARD_TABS = [
  'summary',
  'plan',
  'activity',
  'details',
] as const;
export type AgentDashboardTab = (typeof AGENT_DASHBOARD_TABS)[number];
export type AgentDashboardTone =
  | 'title'
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'code'
  | 'success'
  | 'warning'
  | 'error'
  | 'running';
export interface AgentDashboardLine {
  text: string;
  tone: AgentDashboardTone;
  bold?: boolean;
}
const MAX_FIELD_CHARS = 16_384;
const MAX_PLAN_ITEMS = 500;
const MAX_PREPARED_ROWS = 2_000;

export function dashboardText(text: string): string {
  const safe = sanitizeMultilineForDisplay(text).replace(/\t/g, '    ');
  return safe.length > MAX_FIELD_CHARS
    ? safe.slice(0, MAX_FIELD_CHARS) + '…'
    : safe;
}
export function dashboardSingleLine(text: string, width: number): string {
  return truncateToWidth(dashboardText(text).replace(/\s*\n\s*/g, ' '), width);
}
export function nextAgentDashboardTab(
  tab: AgentDashboardTab,
  direction: number,
): AgentDashboardTab {
  const index = AGENT_DASHBOARD_TABS.indexOf(tab);
  return AGENT_DASHBOARD_TABS[
    (index + direction + AGENT_DASHBOARD_TABS.length) %
      AGENT_DASHBOARD_TABS.length
  ]!;
}
export function getAgentDashboardLayout(width: number, height: number) {
  const frameHeight = Math.max(3, height - 2);
  const bodyHeight = Math.max(1, frameHeight - 4);
  // The dialog receives the main area after the full-tier side margins.
  const split = width >= 116;
  const rosterWidth = split ? 30 : Math.max(1, width - 4);
  const detailWidth = Math.max(1, width - 4 - (split ? rosterWidth + 3 : 0));
  const headerRows = bodyHeight < 12 ? 4 : 6;
  const pageSize = Math.max(1, bodyHeight - headerRows);
  return {
    frameHeight,
    bodyHeight,
    split,
    rosterWidth,
    detailWidth,
    headerRows,
    pageSize,
  };
}
export function dashboardElapsed(
  entry: { startTime: number; endTime?: number },
  now = Date.now(),
): string {
  return formatDuration(
    Math.floor(Math.max(0, (entry.endTime ?? now) - entry.startTime) / 1000) *
      1000,
    { hideTrailingZeros: true },
  );
}
export function dashboardStatus(entry: DialogEntry): {
  label: string;
  icon: string;
  tone: AgentDashboardTone;
} {
  if (
    (entry.kind === 'agent' || entry.kind === 'workflow') &&
    entry.pendingApprovals?.length
  ) {
    return { label: t('Awaiting approval'), icon: '!', tone: 'warning' };
  }
  switch (entry.status) {
    case 'running':
      return { label: t('Running'), icon: glyphs().dot, tone: 'running' };
    case 'pausing':
      return { label: t('Pausing'), icon: '…', tone: 'warning' };
    case 'paused':
      return { label: t('Paused'), icon: '||', tone: 'warning' };
    case 'completed':
      return { label: t('Completed'), icon: glyphs().done, tone: 'success' };
    case 'failed':
      return { label: t('Failed'), icon: glyphs().failed, tone: 'error' };
    case 'cancelled':
      return { label: t('Stopped'), icon: glyphs().hollow, tone: 'muted' };
    default:
      throw new Error('Unsupported background task status');
  }
}
export function dashboardTaskLabel(entry: DialogEntry): string {
  if (entry.kind === 'dream') return t('[dream] memory consolidation');
  if (entry.kind === 'workflow')
    return (
      '[workflow] ' + (entry.meta?.name ?? entry.description ?? entry.runId)
    );
  if (entry.kind === 'agent')
    return entry.description || entry.subagentType || t('Agent');
  return '[' + entry.kind + '] ' + (entry.description || entry.command);
}
export function dashboardStats(entry: AgentTask): string {
  const parts = [dashboardElapsed(entry)];
  if (entry.stats?.outputTokens !== undefined)
    parts.push(
      t('{{count}} tokens', {
        count: formatTokenCount(entry.stats.outputTokens),
      }),
    );
  if (entry.stats?.toolUses !== undefined)
    parts.push(
      t(
        entry.stats.toolUses === 1
          ? '{{count}} tool call'
          : '{{count}} tool calls',
        { count: String(entry.stats.toolUses) },
      ),
    );
  return parts.join(' · ');
}
export function dashboardActivity(name: string, description: string): string {
  const display = localizeToolDisplayName(TOOL_DISPLAY_BY_NAME[name] ?? name);
  return description ? display + ' · ' + description : display;
}

export function getAgentDashboardLines(
  entry: AgentTask,
  tab: AgentDashboardTab,
  width: number,
  entries: readonly DialogEntry[] = [],
): AgentDashboardLine[] {
  const rows: AgentDashboardLine[] = [];
  let omitted = false;
  const add = (
    text: string,
    tone: AgentDashboardTone = 'secondary',
    bold = false,
  ) => {
    if (rows.length >= MAX_PREPARED_ROWS - 1) {
      omitted = true;
      return;
    }
    for (const part of wrapAnsi(dashboardText(text), Math.max(1, width), {
      hard: true,
      trim: false,
    }).split('\n')) {
      if (rows.length >= MAX_PREPARED_ROWS - 1) {
        omitted = true;
        break;
      }
      rows.push({ text: part, tone, bold });
    }
  };
  const title = (text: string) => {
    if (rows.length) add('');
    add(text, 'title', true);
  };
  const activities = (entry.recentActivities ?? []).slice(-10);
  const current = activities.at(-1);
  const allTodos = entry.todoItems ?? [];
  const todos = allTodos.slice(0, MAX_PLAN_ITEMS);
  const completed = allTodos.filter(
    (todo) => todo.status === 'completed',
  ).length;
  const showPlan = () => {
    if (!todos.length) {
      add(t('No plan recorded'), 'muted');
      return;
    }
    for (const todo of todos) {
      if (rows.length >= MAX_PREPARED_ROWS - 1) {
        omitted = true;
        break;
      }
      const done = todo.status === 'completed';
      const active = todo.status === 'in_progress';
      add(
        (done ? glyphs().done : active ? '>' : glyphs().hollow) +
          ' ' +
          todo.content,
        done ? 'success' : active ? 'running' : 'muted',
      );
      if (todo.blockedBy?.length)
        add(
          t('Depends on: {{ids}}', { ids: todo.blockedBy.join(', ') }),
          'muted',
        );
    }
    if (allTodos.length > todos.length)
      add(
        t('{{count}} more plan items', {
          count: String(allTodos.length - todos.length),
        }),
        'muted',
      );
  };
  const alerts = () => {
    if (entry.pendingApprovals?.length) {
      title(t('Your action is required'));
      add(t('Press a to review the pending approval.'), 'warning');
    }
    if (entry.resumeBlockedReason) {
      title(t('Resume blocked'));
      add(entry.resumeBlockedReason, 'error');
    }
    if (entry.error) {
      title(t('Error'));
      add(entry.error, 'error');
    }
  };
  const planTitle = () =>
    t('Declared plan') +
    (allTodos.length ? ' · ' + completed + '/' + allTodos.length : '');
  if (tab === 'summary') {
    alerts();
    title(entry.status === 'completed' ? t('Result') : t('Now'));
    if (entry.status === 'completed' && entry.result)
      add(entry.result, 'primary');
    else if (current)
      add(dashboardActivity(current.name, current.description), 'code');
    else add(t('No activity recorded'), 'muted');
    title(planTitle());
    showPlan();
    title(t('Recent activity'));
    for (const activity of activities.slice(-4, -1).reverse()) {
      add(
        dashboardSingleLine(
          dashboardActivity(activity.name, activity.description),
          width,
        ),
        'secondary',
      );
    }
    if (activities.length <= 1) add(t('No earlier activity recorded'), 'muted');
  } else if (tab === 'plan') {
    title(planTitle());
    showPlan();
    alerts();
    title(t('About progress'));
    add(
      t('Plan items describe declared work, not estimated time remaining.'),
      'muted',
    );
  } else if (tab === 'activity') {
    title(t('Current event'));
    if (current)
      add(dashboardActivity(current.name, current.description), 'code');
    else add(t('No activity recorded'), 'muted');
    title(t('Progress'));
    for (const activity of activities.slice(0, -1)) {
      add(
        dashboardSingleLine(
          dashboardActivity(activity.name, activity.description),
          width,
        ),
      );
    }
    alerts();
  } else {
    title(t('Prompt'));
    add(entry.prompt || t('No instruction recorded'));
    title(t('Parent'));
    const lookup = (id: string) =>
      entries.find(
        (item): item is AgentTask =>
          item.kind === 'agent' && item.agentId === id,
      );
    const { chain } = ancestorChain(entry, lookup);
    if (chain.length)
      add(
        [...chain]
          .reverse()
          .map((item) => {
            const parent = lookup(item.agentId ?? '');
            return parent
              ? (parent.subagentType ?? t('Agent')) + ' — ' + parent.description
              : (item.agentId ?? '');
          })
          .join(' › '),
      );
    else
      add(
        entry.parentName
          ? entry.parentName + ' · ' + t('no longer running')
          : t('Main session'),
      );
    if ((entry.depth ?? 0) > 0)
      add(
        t('nested · level {{level}}', {
          level: String((entry.depth ?? 0) + 1),
        }),
        'muted',
      );
    if (entry.model) {
      title(t('Model'));
      add(entry.model);
    }
    const children = entries
      .filter(
        (child) =>
          child.kind === 'agent' && child.parentAgentId === entry.agentId,
      )
      .sort(compareActiveThenTerminal);
    if (children.length) {
      title(t('Sub-agents'));
      for (const child of children.slice(0, 5))
        add(
          dashboardStatus(child).icon +
            ' ' +
            (child.kind === 'agent'
              ? (child.subagentType ?? t('Agent')) + ' — '
              : '') +
            dashboardTaskLabel(child),
        );
      if (children.length > 5)
        add(
          t('{{count}} more', { count: String(children.length - 5) }),
          'muted',
        );
    }
    if (entry.outputFile) {
      title(t('Transcript'));
      add(entry.outputFile, 'code');
    }
    alerts();
  }
  if (omitted)
    rows.push({
      text: dashboardSingleLine(
        t('Additional content omitted; inspect the transcript.'),
        width,
      ),
      tone: 'muted',
    });
  return rows;
}
