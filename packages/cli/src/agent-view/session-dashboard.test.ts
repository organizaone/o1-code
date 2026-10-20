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
