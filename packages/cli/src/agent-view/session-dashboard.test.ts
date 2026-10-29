/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderAgentSessionDashboard } from './session-dashboard.js';
import type { AgentSessionRow } from './session-catalog.js';
import stringWidth from 'string-width';

const rows: AgentSessionRow[] = [
  {
    sessionId: 'a',
    workspace: 'C:/Workspace/o1-code',
    title: 'Corrigir indicador de conexão',
    status: 'idle',
    updatedAt: Date.now(),
    model: 'mimo-v2.6-flash',
    summary: 'A conexão já foi conferida.',
    current: true,
    switchable: true,
    source: 'live',
  },
  {
    sessionId: 'b',
    workspace: 'C:/Workspace/other',
    title: 'Revisar autenticação',
    status: 'working',
    updatedAt: Date.now() - 60_000,
    model: 'gpt-6.1-sol',
    current: false,
    switchable: true,
    source: 'live',
  },
];

describe('agent session dashboard', () => {
  it('shows grouped aligned columns and detail at wide widths', () => {
    const frame = renderAgentSessionDashboard(rows, {
      columns: 120,
      rows: 30,
      selected: 0,
      language: 'pt',
    });
    expect(frame).toContain('TAREFA');
    expect(frame).toContain('STATUS');
    expect(frame).toContain('TEMPO');
    expect(frame).toContain('MODELO');
    expect(frame).toContain('C:/Workspace/o1-code');
    expect(frame).toContain('C:/Workspace/other');
    expect(frame).toContain('RESUMO');
    expect(frame).toContain('mimo-v2.6-flash');
    expect(frame).toContain('Pressione / para buscar');
  });

  it('retains essential columns at narrow widths', () => {
    const frame = renderAgentSessionDashboard(rows, {
      columns: 60,
      rows: 18,
      selected: 1,
      language: 'pt',
      message: '',
    });
    expect(frame).toContain('TAREFA');
    expect(frame).toContain('STATUS');
    expect(frame).toContain('Revisar');
    expect(frame).not.toContain('RESUMO');
    expect(frame.split('\n').length).toBeLessThanOrEqual(18);
    expect(frame).toContain('Pressione / para buscar');
  });

  it('uses the active light-theme palette for selection', () => {
    const dark = renderAgentSessionDashboard(rows, {
      columns: 120,
      rows: 30,
      selected: 0,
      theme: 'dark',
      language: 'pt',
    });
    const light = renderAgentSessionDashboard(rows, {
      columns: 120,
      rows: 30,
      selected: 0,
      theme: 'light',
      language: 'pt',
    });
    expect(light).not.toBe(dark);
    expect(light).toContain('Corrigir indicador');
  });

  it('uses the active built-in theme instead of the default dark palette', () => {
    const frame = renderAgentSessionDashboard(rows, {
      columns: 120,
      rows: 30,
      selected: 0,
      theme: 'dark',
      themeName: 'Ayu',
    });
    expect(frame).toContain('\x1b[48;2;11;14;20m');
    expect(frame).toContain('\x1b[38;2;174;172;166m');
  });

  it('renders the ANSI theme with its terminal color palette', () => {
    const frame = renderAgentSessionDashboard(rows, {
      columns: 120,
      rows: 30,
      selected: 0,
      theme: 'dark',
      themeName: 'ANSI',
    });
    expect(frame).toContain('\x1b[48;2;30;30;46m');
    expect(frame).toContain('\x1b[37m');
  });

  it('expands the ANSI Light short foreground color', () => {
    const frame = renderAgentSessionDashboard(rows, {
      columns: 120,
      rows: 30,
      selected: 0,
      theme: 'light',
      themeName: 'ANSI Light',
    });
    expect(frame).toContain('\x1b[48;2;250;250;250m');
    expect(frame).toContain('\x1b[38;2;68;68;68m');
  });

  it('falls back to the requested light palette for an unknown theme name', () => {
    const options = {
      columns: 120,
      rows: 30,
      selected: 0,
      theme: 'light',
    } as const;
    expect(
      renderAgentSessionDashboard(rows, {
        ...options,
        themeName: '../invalid',
      }),
    ).toBe(renderAgentSessionDashboard(rows, options));
  });

  it.each([
    ['dark', '10;18;32'],
    ['light', '247;249;252'],
  ] as const)(
    'paints the whole %s frame and keeps text foregrounds explicit',
    (theme, background) => {
      const frame = renderAgentSessionDashboard(rows, {
        columns: 120,
        rows: 30,
        selected: 0,
        theme,
      });
      let foreground = '';
      let currentBackground = '';
      let baseCells = 0;
      let selectedCells = 0;
      // eslint-disable-next-line no-control-regex -- inspect emitted terminal color sequences
      for (const token of frame.matchAll(/\x1b\[([0-9;]*)m|([^\x1b\n])/gu)) {
        if (token[1] !== undefined) {
          const values = token[1].split(';').map(Number);
          for (let index = 0; index < values.length; index++) {
            if (values[index] === 0) {
              foreground = '';
              currentBackground = '';
            } else if (
              (values[index] === 38 || values[index] === 48) &&
              values[index + 1] === 2
            ) {
              const rgb = values.slice(index + 2, index + 5).join(';');
              if (values[index] === 38) foreground = rgb;
              else currentBackground = rgb;
              index += 4;
            }
          }
        } else {
          expect(currentBackground).not.toBe('');
          if (currentBackground === background) baseCells++;
          else selectedCells++;
          if (token[2] !== ' ') expect(foreground).not.toBe('');
        }
      }
      expect(baseCells).toBeGreaterThan(0);
      expect(selectedCells).toBeGreaterThan(0);
      expect(foreground).toBe('');
      expect(currentBackground).toBe('');
    },
  );

  it('does not emit color sequences when NO_COLOR is set', () => {
    const original = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
    try {
      const frame = renderAgentSessionDashboard(rows, {
        columns: 120,
        rows: 30,
        selected: 0,
        theme: 'light',
      });
      // eslint-disable-next-line no-control-regex -- detect terminal color sequences
      expect(frame).not.toMatch(/\x1b\[[0-9;]*m/u);
    } finally {
      if (original === undefined) delete process.env['NO_COLOR'];
      else process.env['NO_COLOR'] = original;
    }
  });

  it('keeps long content inside the frame across terminal widths', () => {
    const longRows = [
      {
        ...rows[0],
        title: 'Título extenso '.repeat(25),
        workspace: `C:/Workspace/${'folder/'.repeat(30)}`,
      },
    ];
    for (const columns of [20, 28, 60, 80, 120, 160]) {
      const frame = renderAgentSessionDashboard(longRows, {
        columns,
        rows: 24,
        selected: 0,
        language: 'pt',
      });
      for (const line of frame.split('\n')) {
        const plain = line.replace(
          new RegExp(String.raw`\x1b\[[0-9;]*m`, 'gu'),
          '',
        );
        expect(stringWidth(plain)).toBeLessThanOrEqual(columns);
      }
    }
  });

  it('uses English text for the English locale', () => {
    const frame = renderAgentSessionDashboard(rows, {
      columns: 120,
      rows: 24,
      selected: 0,
      language: 'en',
    });
    expect(frame).toContain('TASK');
    expect(frame).toContain('LAST MESSAGE');
    expect(frame).toContain('Press / to search');
  });
});
