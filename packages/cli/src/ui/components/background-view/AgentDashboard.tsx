/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ReactNode } from 'react';
import { Box, Text } from 'ink';
import type { DialogEntry } from '../../hooks/useBackgroundTaskView.js';
import { entryId } from '../../hooks/useBackgroundTaskView.js';
import { t } from '../../../i18n/index.js';
import { theme, extendedTheme } from '../../semantic-colors.js';
import { getCachedStringWidth } from '../../utils/textUtils.js';
import { glyphs } from '../../glyphs.js';
import {
  computeAgentTreeInfo,
  computeUserBlockingIds,
  treeRowPrefix,
} from './agent-forest.js';
import {
  AGENT_DASHBOARD_TABS,
  dashboardElapsed,
  dashboardSingleLine,
  dashboardStats,
  dashboardStatus,
  dashboardTaskLabel,
  getAgentDashboardLayout,
  getAgentDashboardLines,
  type AgentDashboardLine,
  type AgentDashboardTab,
  type AgentDashboardTone,
} from './agent-dashboard-model.js';

export interface AgentDashboardProps {
  entries: readonly DialogEntry[];
  selectedEntry: DialogEntry | null;
  selectedIndex: number;
  detailFocused: boolean;
  tab: AgentDashboardTab;
  scrollOffset: number;
  width: number;
  height: number;
  actionHints: readonly string[];
  footerMessage?: string;
  renderOtherDetail: (
    entry: DialogEntry,
    height: number,
    width: number,
  ) => ReactNode;
}
function toneColor(tone: AgentDashboardTone): string {
  return {
    title: theme.text.accent,
    primary: theme.text.primary,
    secondary: theme.text.secondary,
    muted: extendedTheme.text.muted,
    code: theme.text.code,
    success: theme.status.success,
    warning: theme.status.warning,
    error: theme.status.error,
    running: extendedTheme.ui.brand,
  }[tone];
}
function DashboardLine({
  value,
  width,
}: {
  value: AgentDashboardLine;
  width: number;
}) {
  return (
    <Text color={toneColor(value.tone)} bold={value.bold} wrap="truncate-end">
      {dashboardSingleLine(value.text || ' ', width)}
    </Text>
  );
}
const tabLabels = {
  summary: 'Agent summary',
  plan: 'Agent plan',
  activity: 'Agent activity',
  details: 'Agent details',
} as const;
function DashboardTabs({
  tab,
  width,
}: {
  tab: AgentDashboardTab;
  width: number;
}) {
  const names = AGENT_DASHBOARD_TABS.map((key) => t(tabLabels[key]));
  const naturalWidth = names.reduce(
    (sum, name) => sum + getCachedStringWidth(name) + 2,
    0,
  );
  const slot = Math.max(1, Math.floor(width / names.length));
  return (
    <Text wrap="truncate-end">
      {AGENT_DASHBOARD_TABS.map((key, index) => {
        const padding = naturalWidth <= width || slot >= 3 ? ' ' : '';
        const name = dashboardSingleLine(
          names[index]!,
          naturalWidth <= width
            ? width
            : Math.max(1, slot - padding.length * 2),
        );
        return (
          <Text
            key={key}
            bold={tab === key}
            color={
              tab === key ? theme.background.primary : theme.text.secondary
            }
            backgroundColor={tab === key ? theme.text.accent : undefined}
          >
            {padding + name + padding}
          </Text>
        );
      })}
    </Text>
  );
}
export function AgentDashboard({
  entries,
  selectedEntry,
  selectedIndex,
  detailFocused,
  tab,
  scrollOffset,
  width,
  height,
  actionHints,
  footerMessage,
  renderOtherDetail,
}: AgentDashboardProps) {
  const layout = getAgentDashboardLayout(width, height);
  const { bodyHeight, rosterWidth, detailWidth, split, headerRows, pageSize } =
    layout;
  const agent = selectedEntry?.kind === 'agent' ? selectedEntry : undefined;
  const lines = agent
    ? getAgentDashboardLines(agent, tab, detailWidth, entries)
    : [];
  const offset = Math.max(0, Math.min(scrollOffset, lines.length - pageSize));
  const visibleCount = Math.max(1, Math.floor((bodyHeight - 2) / 4));
  const start = Math.min(
    Math.max(0, selectedIndex - visibleCount + 1),
    Math.max(0, entries.length - visibleCount),
  );
  const tree = computeAgentTreeInfo(entries);
  const blocking = computeUserBlockingIds(entries);
  const count = (status: DialogEntry['status']) =>
    entries.filter(
      (item) =>
        item.status === status &&
        (status !== 'running' ||
          (item.kind !== 'agent' && item.kind !== 'workflow') ||
          !item.pendingApprovals?.length),
    ).length;
  const approvals = entries.filter(
    (item) =>
      (item.kind === 'agent' || item.kind === 'workflow') &&
      item.pendingApprovals?.length,
  ).length;
  const title = entries.every((item) => item.kind === 'agent')
    ? t('Agents')
    : t('Background tasks');
  const summary =
    width >= 100
      ? title +
        ' · ' +
        t('{{count}} running', { count: String(count('running')) }) +
        ' · ' +
        t('{{count}} awaiting approval', { count: String(approvals) }) +
        ' · ' +
        t('{{count}} completed', { count: String(count('completed')) }) +
        ' · ' +
        t('{{count}} failed', { count: String(count('failed')) })
      : title +
        ' · ' +
        entries.length +
        ' · ' +
        glyphs().dot +
        ' ' +
        count('running') +
        ' · ' +
        glyphs().warning +
        ' ' +
        approvals +
        ' · ' +
        glyphs().done +
        ' ' +
        count('completed') +
        ' · ' +
        glyphs().failed +
        ' ' +
        count('failed');
  const showDetail = split || detailFocused;
  const footerWidth = Math.max(1, width);
  const tabsHint = t('←→ tabs');
  const backHint = t(width < 60 ? 'esc back' : 'esc back to list');
  const listHint = t(
    width < 60
      ? '↑↓ agents · enter view · esc close'
      : '↑↓ agents · enter view · ←→ tabs · esc close',
  );
  const detailHintWidth = getCachedStringWidth(tabsHint + ' · ' + backHint);
  const beforeDetailHint =
    footerWidth >= detailHintWidth + 12 ? t('↑↓ scroll') + ' · ' : '';
  const status = selectedEntry ? dashboardStatus(selectedEntry) : undefined;
  if (width < 36 || height < 12)
    return (
      <Box width={Math.max(1, width)} height={Math.max(1, height)}>
        <Text color={theme.status.warning} wrap="truncate-end">
          {dashboardSingleLine(
            t('Enlarge the terminal to inspect agents. Esc closes.'),
            width,
          )}
        </Text>
      </Box>
    );
  return (
    <Box flexDirection="column" width={width} height={height} flexShrink={0}>
      <Box
        flexDirection="column"
        width={width}
        height={layout.frameHeight}
        borderStyle={glyphs().borderStyle}
        borderColor={extendedTheme.ui.rule}
        paddingX={1}
        flexShrink={0}
      >
        <Text bold wrap="truncate-end">
          {dashboardSingleLine(summary, Math.max(1, width - 4))}
        </Text>
        <Box height={1} flexShrink={0} />
        <Box
          flexDirection="row"
          height={bodyHeight}
          flexShrink={0}
          overflow="hidden"
        >
          {(split || !detailFocused) && (
            <Box
              flexDirection="column"
              width={rosterWidth}
              height={bodyHeight}
              flexShrink={0}
            >
              <Box
                flexDirection="column"
                height={Math.max(0, bodyHeight - 1)}
                overflow="hidden"
                flexShrink={0}
              >
                <Text bold color={theme.text.accent} wrap="truncate-end">
                  {dashboardSingleLine(t('Agents · main session'), rosterWidth)}
                </Text>
                {entries
                  .slice(start, start + visibleCount)
                  .map((item, localIndex) => {
                    const selected = localIndex + start === selectedIndex;
                    const itemStatus = dashboardStatus(item);
                    const prefix =
                      item.kind === 'agent'
                        ? treeRowPrefix(item, tree.get(item.agentId))
                        : '';
                    const blockLabel =
                      item.kind === 'agent' && blocking.has(item.agentId)
                        ? '[blocking] '
                        : '';
                    const label = dashboardSingleLine(
                      prefix + blockLabel + dashboardTaskLabel(item),
                      Math.max(
                        0,
                        rosterWidth -
                          getCachedStringWidth(
                            glyphs().prompt + ' ' + itemStatus.icon + ' ',
                          ),
                      ),
                    );
                    return (
                      <Box
                        key={entryId(item)}
                        flexDirection="column"
                        flexShrink={0}
                      >
                        <Text wrap="truncate-end">
                          <Text color={extendedTheme.ui.brand}>
                            {selected ? glyphs().prompt + ' ' : '  '}
                          </Text>
                          <Text color={toneColor(itemStatus.tone)}>
                            {itemStatus.icon + ' '}
                          </Text>
                          <Text
                            color={
                              selected
                                ? theme.text.primary
                                : theme.text.secondary
                            }
                            bold={selected}
                          >
                            {label}
                          </Text>
                        </Text>
                        <Text
                          color={toneColor(itemStatus.tone)}
                          wrap="truncate-end"
                        >
                          {dashboardSingleLine(
                            '    ' + itemStatus.label,
                            rosterWidth,
                          )}
                        </Text>
                        <Text
                          color={extendedTheme.text.muted}
                          wrap="truncate-end"
                        >
                          {dashboardSingleLine(
                            '    ' +
                              (item.kind === 'agent'
                                ? dashboardStats(item)
                                : dashboardElapsed(item)),
                            rosterWidth,
                          )}
                        </Text>
                        <Text> </Text>
                      </Box>
                    );
                  })}
              </Box>
              <Text color={extendedTheme.text.muted} wrap="truncate-end">
                {dashboardSingleLine(
                  t('{{count}} tasks · {{start}}–{{end}} visible', {
                    count: String(entries.length),
                    start: String(start + 1),
                    end: String(Math.min(start + visibleCount, entries.length)),
                  }),
                  rosterWidth,
                )}
              </Text>
            </Box>
          )}
          {split && (
            <Box width={3} flexDirection="column" flexShrink={0}>
              {Array.from({ length: bodyHeight }, (_, index) => (
                <Text key={index} color={extendedTheme.ui.rule}>
                  {' │ '}
                </Text>
              ))}
            </Box>
          )}
          {showDetail && (
            <Box
              flexDirection="column"
              width={detailWidth}
              height={bodyHeight}
              flexShrink={0}
              overflow="hidden"
            >
              {agent ? (
                <>
                  <Text bold wrap="truncate-end">
                    {dashboardSingleLine(
                      dashboardTaskLabel(agent),
                      detailWidth,
                    )}
                  </Text>
                  {headerRows === 6 && (
                    <Text color={extendedTheme.text.muted} wrap="truncate-end">
                      {dashboardSingleLine(
                        (agent.subagentType ?? t('Agent')) +
                          ' · ' +
                          agent.agentId,
                        detailWidth,
                      )}
                    </Text>
                  )}
                  <Text
                    color={status ? toneColor(status.tone) : undefined}
                    wrap="truncate-end"
                  >
                    {dashboardSingleLine(
                      (status ? status.icon + ' ' + status.label + ' · ' : '') +
                        dashboardStats(agent),
                      detailWidth,
                    )}
                  </Text>
                  {headerRows === 6 && <Text> </Text>}
                  <DashboardTabs tab={tab} width={detailWidth} />
                  <Text> </Text>
                  {lines
                    .slice(offset, offset + pageSize)
                    .map((value, index) => (
                      <DashboardLine
                        key={index}
                        value={value}
                        width={detailWidth}
                      />
                    ))}
                </>
              ) : selectedEntry ? (
                renderOtherDetail(selectedEntry, bodyHeight, detailWidth)
              ) : (
                <Text>{t('No entry to show.')}</Text>
              )}
            </Box>
          )}
        </Box>
      </Box>
      <Box height={2} flexDirection="column" flexShrink={0}>
        {footerMessage ? (
          <Text color={theme.status.warning}>
            {dashboardSingleLine(footerMessage, footerWidth * 2)}
          </Text>
        ) : (
          <>
            <Text color={extendedTheme.text.muted} wrap="truncate-end">
              {detailFocused ? (
                <>
                  {beforeDetailHint}
                  <Text bold color={theme.text.accent}>
                    {tabsHint}
                  </Text>
                  {' · '}
                  <Text bold color={theme.text.accent}>
                    {backHint}
                  </Text>
                </>
              ) : (
                dashboardSingleLine(listHint, footerWidth)
              )}
            </Text>
            <Box justifyContent="space-between">
              <Text color={theme.text.secondary} wrap="truncate-end">
                {dashboardSingleLine(
                  actionHints.join(' · '),
                  Math.max(1, footerWidth - 22),
                )}
              </Text>
              {agent && showDetail && (
                <Text color={extendedTheme.text.muted}>
                  {dashboardSingleLine(
                    t('lines {{start}}–{{end}}/{{total}}', {
                      start: String(Math.min(offset + 1, lines.length)),
                      end: String(Math.min(offset + pageSize, lines.length)),
                      total: String(lines.length),
                    }),
                    21,
                  )}
                </Text>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
