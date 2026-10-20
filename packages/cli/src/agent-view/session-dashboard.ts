/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import readline from 'node:readline';
import stringWidth from 'string-width';
import type { AgentSessionRow, AgentSessionStatus } from './session-catalog.js';
import { loadAgentSessionExcerpt } from './session-catalog.js';
import { O1CodeDark } from '../ui/themes/o1-code-dark.js';
import { O1CodeLight } from '../ui/themes/o1-code-light.js';
import { getDashboardCopy, type DashboardCopy } from './dashboard-copy.js';

const CSI = '\x1b[';
function ansiColor(hex: string, background = false): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex);
  if (!match || process.env['NO_COLOR']) return '';
  return `${CSI}${background ? 48 : 38};2;${parseInt(match[1], 16)};${parseInt(match[2], 16)};${parseInt(match[3], 16)}m`;
}

function dashboardColors(type: 'dark' | 'light') {
  const theme = type === 'light' ? O1CodeLight : O1CodeDark;
  return {
    reset: process.env['NO_COLOR'] ? '' : `${CSI}0m`,
    bold: process.env['NO_COLOR'] ? '' : `${CSI}1m`,
    selected:
      ansiColor(theme.extendedColors.ui.brand, true) +
      ansiColor(theme.semanticColors.background.primary),
    muted: ansiColor(theme.semanticColors.text.secondary),
    meta: ansiColor(theme.extendedColors.text.muted),
    accent: ansiColor(theme.semanticColors.text.accent),
    rule: ansiColor(theme.extendedColors.ui.separator),
  };
}

type DashboardColors = ReturnType<typeof dashboardColors>;

export interface DashboardViewport {
  columns: number;
  rows: number;
  selected: number;
  search?: string;
  searchMode?: boolean;
  detailScroll?: number;
  detailFocused?: boolean;
  message?: string;
  theme?: 'dark' | 'light';
  language?: string;
}

function groupSessionRows(rows: readonly AgentSessionRow[]): AgentSessionRow[] {
  const groups = new Map<string, AgentSessionRow[]>();
  for (const row of rows) {
    const group = groups.get(row.workspace) ?? [];
    group.push(row);
    groups.set(row.workspace, group);
  }
  return [...groups.values()].flat();
}

export function renderAgentSessionDashboard(
  allRows: readonly AgentSessionRow[],
  view: DashboardViewport,
): string {
  const width = Math.max(8, view.columns - 1);
  const color = dashboardColors(view.theme ?? 'dark');
  const copy = getDashboardCopy(view.language ?? 'en');
  const inner = width - 4;
  const bodyHeight = Math.max(1, view.rows - 4);
  const search = view.search ?? '';
  const rows = groupSessionRows(
    allRows.filter((row) =>
      `${row.title} ${row.workspace}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    ),
  );
  const selected = Math.max(0, Math.min(view.selected, rows.length - 1));
  const split = view.columns >= 110;
  const rosterWidth = split ? Math.floor(inner * 0.59) : inner;
  const detailWidth = split ? inner - rosterWidth - 3 : inner;
  const statusWidth = rosterWidth >= 75 ? 13 : 9;
  const timeWidth = 5;
  const modelWidth = rosterWidth >= 60 ? 16 : 10;
  const gap = ' ';
  const titleWidth = Math.max(
    6,
    rosterWidth - statusWidth - timeWidth - modelWidth - 3,
  );
  const groups = new Map<
    string,
    Array<{ row: AgentSessionRow; index: number }>
  >();
  for (const [index, row] of rows.entries()) {
    const group = groups.get(row.workspace) ?? [];
    group.push({ row, index });
    groups.set(row.workspace, group);
  }
  const roster: Array<{ text: string; index?: number }> = [
    { text: '' },
    {
      text: `${color.meta}${pad(copy.task, titleWidth)}${gap}${pad(copy.status, statusWidth)}${gap}${pad(copy.time, timeWidth)}${gap}${pad(copy.model, modelWidth)}${color.reset}`,
    },
  ];
  for (const [workspace, entries] of groups) {
    roster.push({
      text: `${color.meta}${spread(workspace, String(entries.length), rosterWidth)}${color.reset}`,
    });
    for (const entry of entries) {
      const { row, index } = entry;
      const active = index === selected;
      const marker = row.current ? '●' : ' ';
      const label = statusLabel(row.status, statusWidth, copy);
      const title = pad(
        `${active ? '❯' : ' '} ${marker} ${row.title || copy.untitled}`,
        titleWidth,
      );
      const facts = `${pad(label, statusWidth)}${gap}${pad(shortAge(row.updatedAt, copy), timeWidth)}${gap}${pad(row.model ?? '—', modelWidth)}`;
      roster.push({
        text: active
          ? `${color.selected}${color.bold}${title}${gap}${facts}${color.reset}`
          : `${color.bold}${title}${color.reset}${gap}${color.muted}${facts}${color.reset}`,
        index,
      });
    }
    roster.push({ text: '' });
  }
  if (rows.length === 0) roster.push({ text: copy.noSessions });
  const selectedLine = Math.max(
    0,
    roster.findIndex((line) => line.index === selected),
  );
  const maxOffset = Math.max(0, roster.length - bodyHeight);
  const offset = Math.min(
    maxOffset,
    Math.max(0, selectedLine - bodyHeight + 3),
  );
  const visibleRoster = roster
    .slice(offset, offset + bodyHeight)
    .map((line) => line.text);
  const detail = rows[selected]
    ? detailLines(
        rows[selected],
        detailWidth,
        bodyHeight,
        view.detailScroll ?? 0,
        color,
        copy,
      )
    : [copy.noSessions];
  const counts = {
    working: rows.filter((row) => row.status === 'working').length,
    input: rows.filter((row) => row.status === 'needs_input').length,
    failed: rows.filter((row) => row.status === 'failed').length,
  };
  const overview =
    inner < 70
      ? `${rows.length} ${copy.conversations} · ${copy.workShort} ${counts.working} · ${copy.actionShort} ${counts.input} · ${copy.failShort} ${counts.failed}`
      : `${groups.size} ${copy.folders} · ${rows.length} ${copy.conversations} · ${copy.working.toLowerCase()} ${counts.working} · ${copy.action.toLowerCase()} ${counts.input} · ${copy.failShort} ${counts.failed}`;
  const lines = [
    `${color.bold}${copy.sessions}${color.reset} ${color.meta}· ${overview}${color.reset}`,
  ];
  for (let index = 0; index < bodyHeight; index++) {
    if (split) {
      lines.push(
        `${pad(visibleRoster[index] ?? '', rosterWidth)} ${color.rule}│${color.reset} ${pad(detail[index] ?? '', detailWidth)}`,
      );
    } else {
      lines.push(
        view.detailFocused
          ? (detail[index] ?? '')
          : (visibleRoster[index] ?? ''),
      );
    }
  }
  const shortcuts = split
    ? copy.shortcutsWide
    : view.detailFocused
      ? copy.shortcutsDetail
      : copy.shortcutsNarrow;
  const searchHint =
    view.message ||
    (view.searchMode
      ? `${copy.search} ${search}▌`
      : search
        ? `${copy.filter} ${search}`
        : copy.pressSearch);
  lines.push(spread(shortcuts, searchHint, inner));
  return [
    `╭${'─'.repeat(width - 2)}╮`,
    ...lines
      .slice(0, Math.max(0, view.rows - 2))
      .map((line) => frameLine(line, width)),
    `╰${'─'.repeat(width - 2)}╯`,
  ].join('\n');
}

export async function runAgentSessionDashboard(
  loadRows: () => Promise<AgentSessionRow[]>,
  currentSessionId: string,
  theme: 'dark' | 'light' = 'dark',
  language = 'en',
): Promise<string | undefined> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
    throw new Error('Agent sessions require an interactive terminal.');
  }
  let rows = groupSessionRows(await loadRows());
  let selected = Math.max(
    0,
    rows.findIndex((row) => row.sessionId === currentSessionId),
  );
  let search = '';
  let searchMode = false;
  let detailScroll = 0;
  let detailFocused = false;
  let message = '';
  let active = true;
  const details = new Map<string, string | undefined>();
  const filtered = () =>
    rows.filter((row) =>
      `${row.title} ${row.workspace}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    );
  const render = () => {
    stdout.write(
      `${CSI}H${CSI}2J${renderAgentSessionDashboard(rows, {
        columns: stdout.columns || 80,
        rows: stdout.rows || 24,
        selected,
        search,
        searchMode,
        detailScroll,
        detailFocused,
        message,
        theme,
        language,
      })}`,
    );
  };
  const refreshDetail = () => {
    const row = filtered()[selected];
    if (!row || details.has(row.sessionId)) return;
    details.set(row.sessionId, undefined);
    void loadAgentSessionExcerpt(row)
      .then((excerpt) => {
        details.set(row.sessionId, excerpt);
        const current = rows.find((item) => item.sessionId === row.sessionId);
        if (current && excerpt) current.lastMessage = excerpt;
        if (active) render();
      })
      .catch(() => {});
  };
  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(`${CSI}?1049h${CSI}?25l`);
  render();
  refreshDetail();
  return new Promise<string | undefined>((resolve) => {
    let finished = false;
    let refreshing = false;
    const close = (target?: string) => {
      if (finished) return;
      finished = true;
      active = false;
      clearInterval(refreshTimer);
      stdout.off('resize', render);
      stdin.off('keypress', onKey);
      stdin.setRawMode?.(false);
      stdin.pause();
      stdout.write(`${CSI}?25h${CSI}?1049l`);
      resolve(target);
    };
    const onKey = (character: string, key: readline.Key) => {
      message = '';
      if (key.ctrl && key.name === 'c') return close();
      if (searchMode) {
        if (key.name === 'escape' || key.name === 'return') searchMode = false;
        else if (key.name === 'backspace')
          search = [...search].slice(0, -1).join('');
        else if (character && !key.ctrl && !key.meta && character.length === 1)
          search += character;
        selected = 0;
        detailScroll = 0;
      } else if (key.name === 'escape' || key.name === 'left') {
        if (detailFocused) detailFocused = false;
        else return close();
      } else if (character === '/') {
        searchMode = true;
      } else if (key.name === 'up' || character === 'k') {
        selected = Math.max(0, selected - 1);
        detailScroll = 0;
      } else if (key.name === 'down' || character === 'j') {
        selected = Math.min(filtered().length - 1, selected + 1);
        detailScroll = 0;
      } else if (key.name === 'pageup' || key.name === 'pagedown') {
        detailScroll = Math.max(
          0,
          detailScroll + (key.name === 'pageup' ? -8 : 8),
        );
      } else if (character === ' ' && stdout.columns < 110) {
        detailFocused = !detailFocused;
      } else if (key.name === 'return') {
        const target = filtered()[selected];
        if (target?.switchable) return close(target.sessionId);
        message = getDashboardCopy(language).unavailable;
      }
      render();
      refreshDetail();
    };
    const refreshTimer = setInterval(() => {
      if (refreshing) return;
      refreshing = true;
      const selectedId = filtered()[selected]?.sessionId;
      void loadRows()
        .then((next) => {
          rows = groupSessionRows(next);
          for (const row of rows) {
            const excerpt = details.get(row.sessionId);
            if (excerpt) row.lastMessage = excerpt;
          }
          selected = Math.max(
            0,
            filtered().findIndex((row) => row.sessionId === selectedId),
          );
          if (!finished) {
            render();
            refreshDetail();
          }
        })
        .catch(() => {})
        .finally(() => {
          refreshing = false;
        });
    }, 5000);
    stdout.on('resize', render);
    stdin.on('keypress', onKey);
  });
}

function detailLines(
  row: AgentSessionRow,
  width: number,
  height: number,
  scroll: number,
  color: DashboardColors,
  copy: DashboardCopy,
): string[] {
  const status = statusLabel(row.status, 16, copy);
  const heading = spread(
    `${color.selected} ${truncate(row.title || copy.untitled, Math.max(5, width - status.length - 3))} ${color.reset}`,
    `${color.selected} ${status} ${color.reset}`,
    width,
  );
  const content = [
    heading,
    '',
    `${color.accent}${copy.session}${color.reset}`,
    `${copy.folder}  ${row.workspace}`,
    `${copy.model}  ${row.model ?? '—'}`,
    `${copy.branch}  ${row.branch ?? '—'}`,
    `${copy.lastActivity}  ${shortAge(row.updatedAt, copy)}${row.current ? ` · ${copy.currentSession}` : ''}`,
    '',
    `${color.accent}${copy.summary}${color.reset}`,
    ...wrap(row.summary || row.title || copy.untitled, width),
    '',
    `${color.accent}${copy.now}${color.reset}`,
    ...wrap(
      row.status === 'working'
        ? copy.workProgress
        : row.status === 'needs_input'
          ? copy.waitingAction
          : row.status === 'failed'
            ? copy.sessionFailed
            : row.status === 'inactive'
              ? copy.savedLater
              : copy.waitingMessage,
      width,
    ),
    '',
    `${color.accent}${copy.lastMessage}${color.reset}`,
    ...wrap(row.lastMessage || row.summary || '—', width),
  ];
  const offset = Math.min(
    Math.max(0, scroll),
    Math.max(0, content.length - height),
  );
  return content.slice(offset, offset + height);
}

function statusLabel(
  status: AgentSessionStatus,
  width: number,
  copy: DashboardCopy,
): string {
  const labels: Record<AgentSessionStatus, string> = {
    working: `◌ ${copy.working}`,
    needs_input: `! ${copy.action}`,
    failed: `× ${copy.failed}`,
    idle: `○ ${copy.idle}`,
    inactive: `○ ${copy.inactive}`,
    unknown: `? ${copy.unknown}`,
  };
  return width < 11 && status === 'working'
    ? `◌ ${copy.workShort}`
    : labels[status];
}

function shortAge(timestamp: number, copy: DashboardCopy): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return copy.now.toLowerCase();
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

function wrap(value: string, width: number): string[] {
  const result: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/u)) {
    if (stringWidth(`${line} ${word}`) > width && line) {
      result.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) result.push(line);
  return result.length ? result : [''];
}

function pad(value: string, width: number): string {
  const clipped = truncate(value, width);
  return clipped + ' '.repeat(Math.max(0, width - visibleWidth(clipped)));
}

function truncate(value: string, width: number): string {
  if (width <= 0) return '';
  if (visibleWidth(value) <= width) return value;
  const plain = value.replace(new RegExp(String.raw`\x1b\[[0-9;]*m`, 'gu'), '');
  let result = '';
  for (const character of plain) {
    if (stringWidth(result + character) >= width) break;
    result += character;
  }
  return `${result}…`;
}

function visibleWidth(value: string): number {
  return stringWidth(
    value.replace(new RegExp(String.raw`\x1b\[[0-9;]*m`, 'gu'), ''),
  );
}

function spread(left: string, right: string, width: number): string {
  const clippedRight = truncate(right, Math.max(1, width - 4));
  const clippedLeft = truncate(
    left,
    Math.max(1, width - visibleWidth(clippedRight) - 1),
  );
  return `${clippedLeft}${' '.repeat(Math.max(1, width - visibleWidth(clippedLeft) - visibleWidth(clippedRight)))}${clippedRight}`;
}

function frameLine(value: string, width: number): string {
  return `│ ${pad(value, width - 4)} │`;
}
