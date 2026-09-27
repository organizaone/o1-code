/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import {
  Header,
  getFixedHeaderHeight,
  getHeaderRows,
  type HeaderProps,
} from './Header.js';
import { getCachedStringWidth } from '../utils/textUtils.js';

const GIB = 1024 ** 3;

const renderHeader = (overrides: Partial<HeaderProps> = {}) => {
  const props: HeaderProps = {
    columns: 120,
    version: '0.1.0',
    organization: 'OrganizaOne',
    workingDirectory: 'W:\\workspace\\pessoal\\o1-code',
    memory: { usedBytes: 6.2 * GIB, totalBytes: 16 * GIB },
    mcpOfflineCount: 0,
    ...overrides,
  };
  const { lastFrame } = render(<Header {...props} />);
  // VS15 (the narrow-presentation selector some glyphs carry) has no width.
  return stripAnsi(lastFrame() ?? '')
    .replaceAll('︎', '')
    .split('\n');
};

describe('<Header />', () => {
  it('draws the logo, version, memory, hints and path at 120 columns', () => {
    const lines = renderHeader();
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('█▀█ ▀█');
    expect(lines[0]!.trimEnd().endsWith('v0.1.0 · ORGANIZAONE')).toBe(true);
    expect(lines[1]).toContain('memory 6.2 / 16 GB');
    expect(lines[1]).toContain('▰');
    expect(lines[2]!.trim()).toBe('');
    expect(lines[3]).toContain(
      'esc cancel · shift+tab mode · / commands · @ files · ctrl+c quit',
    );
    expect(
      lines[3]!.trimEnd().endsWith('W:\\workspace\\pessoal\\o1-code'),
    ).toBe(true);
  });

  it('drops ctrl+c under 120 columns and @ files and the bar under 100', () => {
    const medium = renderHeader({ columns: 100 });
    expect(medium[3]).not.toContain('ctrl+c');
    expect(medium[3]).toContain('@ files');
    const compact = renderHeader({ columns: 80 });
    expect(compact[3]).not.toContain('@ files');
    expect(compact[1]).not.toContain('▰');
    expect(compact[1]).toContain('memory 6.2 / 16 GB');
  });

  it('keeps one column from the edge under 80 columns and two above (spec §8)', () => {
    expect(renderHeader({ columns: 70 })[0]).toMatch(/^ O1-CODE\./);
    expect(renderHeader({ columns: 120 })[0]).toMatch(/^ {2}\S/);
  });

  it('turns into three short rows under 80 columns', () => {
    const lines = renderHeader({ columns: 70 });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('O1-CODE.');
    expect(lines.join('\n')).not.toContain('esc cancel');
    expect(lines.join('\n')).not.toContain('memory');
    expect(lines[2]!.trimEnd().endsWith('o1-code')).toBe(true);
  });

  it('shows the update and MCP notices side by side', () => {
    const lines = renderHeader({ updateVersion: '0.1.1', mcpOfflineCount: 2 });
    expect(lines[2]).toContain('↑ v0.1.1 available · /update');
    expect(lines[2]).toContain('● 2 MCPs offline · /mcp');
    const minimal = renderHeader({
      columns: 70,
      updateVersion: '0.1.1',
      mcpOfflineCount: 1,
    });
    expect(minimal[1]).toContain('↑ v0.1.1 · /update');
    expect(minimal[1]).toContain('● MCP · /mcp');
  });

  it('shortens a long path from the start and never exceeds the width', () => {
    const workingDirectory =
      'W:\\a\\very\\long\\directory\\chain\\that\\keeps\\going\\and\\going\\o1-code';
    for (const columns of [60, 70, 80, 100, 120]) {
      const lines = renderHeader({ columns, workingDirectory });
      expect(
        lines.filter((line) => getCachedStringWidth(line) > columns),
      ).toEqual([]);
      expect(lines.join('\n')).toContain('o1-code');
    }
    expect(
      renderHeader({ columns: 80, workingDirectory }).join('\n'),
    ).toContain('…');
  });

  it('drops whole hints to fit a long folder name, never a clipped one', () => {
    const folder = 'a-very-long-folder-name-for-this-project-x';
    const lines = renderHeader({
      columns: 80,
      workingDirectory: `W:\\work\\${folder}`,
    });
    const hintsRow = lines[3]!;
    expect(hintsRow).toContain(folder);
    const left = hintsRow
      .slice(
        0,
        hintsRow.indexOf('…') >= 0
          ? hintsRow.indexOf('…')
          : hintsRow.indexOf(folder),
      )
      .trimEnd();
    expect(left === '' || /(cancel|mode|commands|files|quit)$/.test(left)).toBe(
      true,
    );
  });

  it('pins with a blank row above and below the header', () => {
    expect(getFixedHeaderHeight(120)).toBe(getHeaderRows(120) + 2);
    expect(getFixedHeaderHeight(70)).toBe(getHeaderRows(70) + 2);
  });

  it('reports the row count it renders', () => {
    for (const columns of [60, 79, 80, 100, 120]) {
      expect(renderHeader({ columns })).toHaveLength(getHeaderRows(columns));
    }
  });

  it('while animating, draws the logo from the blank row above and shifts nothing else', () => {
    const animated = renderHeader({
      logoAnimation: { variant: 'pulo', stop: true },
    });
    const still = renderHeader();
    expect(animated).toHaveLength(getHeaderRows(120) + 1);
    expect(animated[0]!.trim()).toBe('');
    expect(animated.slice(1)).toEqual(still);
  });

  it('never animates the wordmark under 80 columns', () => {
    const lines = renderHeader({
      columns: 70,
      logoAnimation: { variant: 'pulo' },
    });
    expect(lines).toHaveLength(getHeaderRows(70));
    expect(lines[0]).toContain('O1-CODE.');
  });
});
