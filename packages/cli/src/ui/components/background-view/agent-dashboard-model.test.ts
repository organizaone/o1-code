/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeAll, describe, expect, it } from 'vitest';
import stringWidth from 'string-width';
import type { AgentTask } from '@organizaone/o1-code-core/agents/background-tasks.js';
import { initializeI18n } from '../../../i18n/index.js';
import {
  dashboardElapsed,
  dashboardSingleLine,
  getAgentDashboardLayout,
  getAgentDashboardLines,
  nextAgentDashboardTab,
} from './agent-dashboard-model.js';

function agent(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'agent-a',
    agentId: 'agent-a',
    kind: 'agent',
    description: 'Inspect task',
    isBackgrounded: true,
    status: 'running',
    startTime: 0,
    abortController: new AbortController(),
    outputFile: '/tmp/agent.jsonl',
    outputOffset: 0,
    notified: false,
    ...overrides,
  };
}
describe('agent dashboard presentation', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  it('uses a separate pane at a 120-column terminal after its side margins', () => {
    expect(getAgentDashboardLayout(116, 30).split).toBe(true);
    expect(getAgentDashboardLayout(96, 30).split).toBe(false);
  });
  it.each([
    [116, 34],
    [86, 24],
    [66, 18],
    [40, 12],
  ])(
    'reserves a blank row under tabs and fits content in %dx%d',
    (width, height) => {
      const layout = getAgentDashboardLayout(width, height);
      expect(layout.frameHeight + 2).toBeLessThanOrEqual(height);
      expect(layout.headerRows + layout.pageSize).toBeLessThanOrEqual(
        layout.bodyHeight,
      );
      expect(
        layout.detailWidth + (layout.split ? layout.rosterWidth + 3 : 0) + 4,
      ).toBeLessThanOrEqual(width);
    },
  );
  it('does not invent a plan from successful activities', () => {
    const rows = getAgentDashboardLines(
      agent({
        recentActivities: [
          { name: 'read_file', description: 'src/index.ts', at: 1 },
        ],
      }),
      'plan',
      60,
    );
    expect(rows.map((row) => row.text).join('\n')).toContain(
      'No plan recorded',
    );
    expect(rows.some((row) => row.text.startsWith('✓'))).toBe(false);
  });
  it.each(['failed', 'cancelled', 'completed'] as const)(
    'preserves incomplete declared work when the agent is %s',
    (status) => {
      const rows = getAgentDashboardLines(
        agent({
          status,
          todoItems: [
            { id: 'read', content: 'Read sources', status: 'completed' },
            {
              id: 'verify',
              content: 'Verify behavior',
              status: 'pending',
              blockedBy: ['read'],
            },
          ],
        }),
        'plan',
        70,
      );
      const text = rows.map((row) => row.text).join('\n');
      expect(text).toContain('1/2');
      expect(rows.find((row) => row.text.includes('Read sources'))?.tone).toBe(
        'success',
      );
      expect(
        rows.find((row) => row.text.includes('Verify behavior'))?.tone,
      ).toBe('muted');
      expect(text).toContain('Depends on: read');
    },
  );
  it('keeps the newest activity and complete transcript path readable through wrapped rows', () => {
    const path =
      'C:/Users/developer/.o1-code/projects/long-project/subagents/agent-general-purpose-unique.jsonl';
    const entry = agent({
      outputFile: path,
      recentActivities: [
        { name: 'run_shell_command', description: 'echo old', at: 1 },
        {
          name: 'read_file',
          description: 'long/'.repeat(30) + 'TAIL_MARKER',
          at: 2,
        },
      ],
    });
    expect(
      getAgentDashboardLines(entry, 'summary', 36)
        .map((row) => row.text)
        .join(''),
    ).toContain('TAIL_MARKER');
    expect(
      getAgentDashboardLines(entry, 'details', 36)
        .map((row) => row.text)
        .join(''),
    ).toContain(path);
  });
  it('neutralizes controls and bounds every row including wide glyphs', () => {
    const entry = agent({ prompt: '界'.repeat(200) + '\u001b[2J\r\b\u0007' });
    for (const row of getAgentDashboardLines(entry, 'details', 23)) {
      for (const control of ['\u001b', '\r', '\b', '\u0007'])
        expect(row.text).not.toContain(control);
      expect(stringWidth(row.text)).toBeLessThanOrEqual(23);
    }
    expect(
      stringWidth(dashboardSingleLine('界'.repeat(100), 9)),
    ).toBeLessThanOrEqual(9);
  });
  it('caps preparation for a pathological plan instead of allocating millions of rows', () => {
    const entry = agent({
      todoItems: Array.from({ length: 500 }, (_, i) => ({
        id: String(i),
        content: 'long task '.repeat(5_000),
        status: 'pending' as const,
      })),
    });
    expect(
      getAgentDashboardLines(entry, 'plan', 36).length,
    ).toBeLessThanOrEqual(2_000);
  });
  it('wraps tab navigation in both directions', () => {
    expect(nextAgentDashboardTab('summary', -1)).toBe('details');
    expect(nextAgentDashboardTab('details', 1)).toBe('summary');
  });
  it('freezes elapsed time at the recorded terminal moment', () => {
    expect(dashboardElapsed({ startTime: 0, endTime: 2_000 }, 90_000)).toBe(
      '2s',
    );
  });
});
