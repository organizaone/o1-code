/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import type { AgentTask } from '@organizaone/o1-code-core/agents/background-tasks.js';
import { initializeI18n } from '../../../i18n/index.js';
import { setGlyphMode } from '../../glyphs.js';
import { AgentDashboard, type AgentDashboardProps } from './AgentDashboard.js';

function agent(id: string): AgentTask {
  return {
    id,
    agentId: id,
    kind: 'agent',
    description: 'Task ' + id,
    status: 'running',
    isBackgrounded: true,
    startTime: Date.now(),
    abortController: new AbortController(),
    outputFile: '/tmp/' + id + '.jsonl',
    outputOffset: 0,
    notified: false,
  };
}
function setup(overrides: Partial<AgentDashboardProps> = {}) {
  const entries = [agent('a'), agent('b'), agent('c')];
  const props: AgentDashboardProps = {
    entries,
    selectedEntry: entries[0]!,
    selectedIndex: 0,
    detailFocused: false,
    tab: 'summary',
    scrollOffset: 0,
    width: 80,
    height: 26,
    actionHints: ['x stop'],
    renderOtherDetail: () => <Text>Other task</Text>,
    ...overrides,
  };
  return render(<AgentDashboard {...props} />);
}
describe('AgentDashboard', () => {
  it('uses the compatibility completion glyph in its compact status summary', () => {
    setGlyphMode('compat');
    try {
      const completed = { ...agent('done'), status: 'completed' as const };
      const { lastFrame } = setup({
        width: 70,
        entries: [completed],
        selectedEntry: completed,
      });
      expect(lastFrame()).toContain('√ 1');
      expect(lastFrame()).not.toContain('✓');
    } finally {
      setGlyphMode('full');
    }
  });
  beforeAll(async () => {
    await initializeI18n('en');
  });
  it('pins the visible roster count above the lower border regardless of selected task', () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      agent(String(index)),
    );
    const { lastFrame, rerender } = setup({ entries });
    const countRow = () =>
      (lastFrame() ?? '')
        .split('\n')
        .findIndex((text) => text.includes('12 tasks'));
    const initialRow = countRow();
    expect(initialRow).toBe(22);
    rerender(
      <AgentDashboard
        entries={entries}
        selectedEntry={entries[11]!}
        selectedIndex={11}
        detailFocused={false}
        tab="summary"
        scrollOffset={0}
        width={80}
        height={26}
        actionHints={[]}
        renderOtherDetail={() => null}
      />,
    );
    expect(countRow()).toBe(initialRow);
    expect(lastFrame()).toContain('Task 11');
    expect(lastFrame()).not.toContain('choose');
  });
  it('shows the roster first on a narrow terminal and preserves tab choice when detail opens', () => {
    const list = setup({ width: 70 });
    expect(list.lastFrame()).not.toContain('No plan recorded');
    const detail = setup({ width: 70, detailFocused: true, tab: 'plan' });
    expect(detail.lastFrame()).toContain('Declared plan');
    expect(detail.lastFrame()).toContain('esc back to list');
    expect(detail.lastFrame()).not.toContain('Foco:');
  });
  it('leaves a complete blank row between tabs and section content', () => {
    const { lastFrame } = setup({ width: 80, detailFocused: true });
    const lines = (lastFrame() ?? '').split('\n');
    const tabs = lines.findIndex(
      (text) => text.includes('Summary') && text.includes('Details'),
    );
    expect(tabs).toBeGreaterThan(0);
    expect(lines[tabs + 1]?.replace(/[│\s]/g, '')).toBe('');
    expect(lines[tabs + 2]).toContain('Now');
  });
  it('keeps both primary detail shortcuts visible at the minimum supported width', () => {
    const { lastFrame } = setup({ width: 40, height: 12, detailFocused: true });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('←→ tabs');
    expect(frame).toContain('esc back');
    expect(frame.split('\n').length).toBeLessThanOrEqual(12);
  });
  it('shows a bounded resize notice when there is no space for detail and controls', () => {
    const { lastFrame } = setup({ width: 32, height: 8, detailFocused: true });
    expect(lastFrame()).toContain('Enlarge the terminal');
    expect((lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(8);
  });
});
