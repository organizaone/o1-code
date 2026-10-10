/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { DiffStat } from '@organizaone/o1-code-core/tools/tools.js';
import { extendedTheme, theme } from '../../semantic-colors.js';
import { t } from '../../../i18n/index.js';
import { ToolCallStatus, type IndividualToolCallDisplay } from '../../types.js';
import {
  getOverallStatus,
  getToolCategory,
  isCollapsibleTool,
} from './CompactToolGroupDisplay.js';
import {
  showsToolLabel,
  ToolStatusIndicator,
} from '../shared/ToolStatusIndicator.js';
import { ToolElapsedTime } from '../shared/ToolElapsedTime.js';
import {
  oneLine,
  summaryLabel,
  summaryTarget,
} from '../../utils/summary-label.js';

// Result displays that are themselves a progress summary or need the user's
// eyes (todo list, plan, review findings, subagent roster, question answers):
// a group carrying one keeps the Detailed rendering in Summary mode too.
const SELF_SUMMARIZING_RESULTS = new Set([
  'todo_list',
  'plan_summary',
  'findings_list',
  'task_execution',
  'ask_user_question_answers',
]);

export function keepsDetailedRendering(
  tool: IndividualToolCallDisplay,
): boolean {
  const display = tool.resultDisplay;
  return (
    typeof display === 'object' &&
    display !== null &&
    'type' in display &&
    typeof display.type === 'string' &&
    SELF_SUMMARIZING_RESULTS.has(display.type)
  );
}

/** The sentence a Summary row shows: the model's intent, else a label. */
export function summarySentence(tool: IndividualToolCallDisplay): string {
  const intent = tool.intent ? oneLine(tool.intent) : '';
  return intent || summaryLabel(tool);
}

function diffStatOf(tool: IndividualToolCallDisplay): DiffStat | undefined {
  const display = tool.resultDisplay;
  if (
    typeof display === 'object' &&
    display !== null &&
    'diffStat' in display
  ) {
    return display.diffStat as DiffStat | undefined;
  }
  return undefined;
}

function errorLine(tool: IndividualToolCallDisplay): string | undefined {
  if (tool.status !== ToolCallStatus.Error) return undefined;
  const display = tool.resultDisplay;
  const text = typeof display === 'string' ? display : '';
  const first = text.split('\n').find((line) => line.trim()) ?? '';
  return oneLine(first) || undefined;
}

/** Consecutive read/search/list calls share one row. */
function groupRows(
  toolCalls: IndividualToolCallDisplay[],
): IndividualToolCallDisplay[][] {
  const rows: IndividualToolCallDisplay[][] = [];
  for (const tool of toolCalls) {
    const previous = rows[rows.length - 1];
    const foldable =
      isCollapsibleTool(tool.name) && tool.status !== ToolCallStatus.Error;
    if (
      foldable &&
      previous &&
      previous.every(
        (p) => isCollapsibleTool(p.name) && p.status !== ToolCallStatus.Error,
      )
    ) {
      previous.push(tool);
    } else {
      rows.push([tool]);
    }
  }
  return rows;
}

const SummaryRow: React.FC<{
  tools: IndividualToolCallDisplay[];
  contentWidth: number;
}> = ({ tools, contentWidth }) => {
  const first = tools[0];
  const status = getOverallStatus(tools);
  const active =
    tools.find((tool) => tool.status === ToolCallStatus.Executing) ??
    tools[tools.length - 1];
  const showLabel = showsToolLabel(contentWidth);
  const error = errorLine(first);

  let suffix: React.ReactNode = null;
  if (tools.length > 1) {
    const allFiles = tools.every((tool) => {
      const category = getToolCategory(tool.name);
      return category === 'read' || category === 'list';
    });
    suffix = (
      <Text color={extendedTheme.text.muted}>
        {' · '}
        {allFiles
          ? t('{{count}} files', { count: String(tools.length) })
          : t('{{count}} steps', { count: String(tools.length) })}
      </Text>
    );
  } else {
    const target = summaryTarget(first);
    const stat = diffStatOf(first);
    const category = getToolCategory(first.name);
    const namesFile =
      target && (category === 'edit' || category === 'write' || stat);
    if (namesFile || stat) {
      suffix = (
        <Text>
          {namesFile && (
            <Text color={extendedTheme.text.muted}>{` · ${target}`}</Text>
          )}
          {stat && (
            <>
              <Text color={theme.status.success}>
                {` +${stat.model_added_lines}`}
              </Text>
              <Text color={theme.status.error}>
                {` −${stat.model_removed_lines}`}
              </Text>
            </>
          )}
        </Text>
      );
    }
  }

  return (
    <Box flexDirection="column" width={contentWidth}>
      <Box flexDirection="row">
        <ToolStatusIndicator
          status={status}
          name={active.name}
          kind={active.kind}
          showLabel={showLabel}
        />
        <Box flexGrow={1}>
          <Text wrap="truncate-end">
            {summarySentence(first)}
            {suffix}
          </Text>
        </Box>
        <ToolElapsedTime
          status={status}
          executionStartTime={active.executionStartTime}
        />
      </Box>
      {error && (
        <Box paddingLeft={2}>
          <Text color={theme.status.error} wrap="truncate-end">
            {error}
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Summary display mode: one row per step with the step's purpose, no diff,
 * file body, shell output or arguments. Ctrl+O shows the Detailed view.
 */
export const SummaryToolGroupDisplay: React.FC<{
  toolCalls: IndividualToolCallDisplay[];
  contentWidth: number;
}> = ({ toolCalls, contentWidth }) => (
  <Box flexDirection="column" width={contentWidth}>
    {groupRows(toolCalls).map((tools) => (
      <SummaryRow
        key={tools[0].callId}
        tools={tools}
        contentWidth={contentWidth}
      />
    ))}
  </Box>
);
