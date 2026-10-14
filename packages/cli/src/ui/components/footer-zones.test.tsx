/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { ApprovalMode } from '@organizaone/o1-code-core/config/approval-mode.js';
import {
  GitZone,
  ModelQuotaZone,
  ModeZone,
  REASONING_DEFAULT,
  UsageZone,
  formatTokens,
  formatTurnTime,
} from './footer-zones.js';

const VS15 = String.fromCharCode(0xfe0e);
const text = (node: React.ReactElement) =>
  stripAnsi(render(node).lastFrame() ?? '').replaceAll(VS15, '');
const inlineText = (node: React.ReactElement) =>
  text(node)
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .join(' ');

describe('footer zones', () => {
  it('formats turn time and tokens', () => {
    expect([0, 8, 59, 60, 182].map(formatTurnTime)).toEqual([
      '0s',
      '8s',
      '59s',
      '1m 00s',
      '3m 02s',
    ]);
    expect([0, 950, 12_400, 1_200_000].map(formatTokens)).toEqual([
      '0',
      '950',
      '12.4k',
      '1200.0k',
    ]);
  });

  it('shows mode, model and reasoning, shortening by width', () => {
    const props = {
      mode: ApprovalMode.AUTO,
      model: 'glm-5.3',
      reasoning: 'high',
    } as const;
    expect(text(<ModeZone tier="full" {...props} />)).toBe(
      '● AUTO │ glm-5.3 · reasoning high',
    );
    expect(text(<ModeZone tier="compact" {...props} />)).toBe(
      '● AUTO │ glm-5.3 · high',
    );
    expect(text(<ModeZone tier="minimal" {...props} />)).toBe(
      '● AUTO │ glm-5.3',
    );
    expect(
      text(
        <ModeZone
          tier="full"
          mode={ApprovalMode.DEFAULT}
          model="m"
          reasoning={false}
          safeMode
        />,
      ),
    ).toBe('● DEFAULT │ m · reasoning off · Safe Mode');
    expect(
      text(
        <ModeZone
          tier="full"
          mode={ApprovalMode.DEFAULT}
          model="m"
          reasoning={REASONING_DEFAULT}
        />,
      ),
    ).toBe('● DEFAULT │ m · reasoning default');
  });

  it('names the Summary display mode from the compact tier up', () => {
    const props = {
      mode: ApprovalMode.DEFAULT,
      model: 'm',
      reasoning: 'high',
    } as const;
    expect(text(<ModeZone tier="full" {...props} summaryMode />)).toBe(
      '● DEFAULT │ m · reasoning high · summary',
    );
    expect(text(<ModeZone tier="compact" {...props} summaryMode />)).toBe(
      '● DEFAULT │ m · high · summary',
    );
    expect(text(<ModeZone tier="minimal" {...props} summaryMode />)).toBe(
      '● DEFAULT │ m',
    );
    expect(text(<ModeZone tier="full" {...props} />)).toBe(
      '● DEFAULT │ m · reasoning high',
    );
  });

  it('shows the branch and the diff, and nothing without a branch', () => {
    expect(
      text(
        <GitZone branch="main" diff={{ linesAdded: 31, linesRemoved: 6 }} />,
      ),
    ).toBe('⎇ main +31 -6');
    expect(text(<GitZone branch="main" diff={null} />)).toBe('⎇ main');
    expect(
      text(<GitZone branch="main" diff={{ linesAdded: 0, linesRemoved: 0 }} />),
    ).toBe('⎇ main');
    expect(text(<GitZone diff={null} />)).toBe('');
  });

  it('shows usage, idle dashes and the request status', () => {
    expect(
      text(
        <UsageZone
          tier="full"
          contextPercent={81}
          tokens={12_400}
          turnStartedAt={Date.now() - 182_000}
          status="online"
        />,
      ),
    ).toBe('▰▰▰▰▰▱ 81% ctx · 12.4k tok · 3m 02s · ● online');
    expect(
      text(<UsageZone tier="medium" contextPercent={0} status="online" />),
    ).toBe('0% ctx · — tok · — · ● online');
    expect(
      text(<UsageZone tier="full" contextPercent={5} status="failed" />),
    ).toContain('● failed');
    expect(
      text(<UsageZone tier="minimal" contextPercent={5} status="none" />),
    ).toBe('5% ctx · — · ○');
    expect(
      text(
        <UsageZone
          tier="medium"
          contextPercent={42}
          status="online"
          modelQuota={{
            fiveHour: { id: 'five_hour', name: '5-hour', usedPercent: 25 },
            weekly: { id: 'weekly', name: 'Weekly', usedPercent: 84 },
          }}
        />,
      ),
    ).toBe('42% ctx · 5h 75% · ! Weekly 16% remaining · — tok · — · ● online');
  });

  it('shows only API-reported percentages without a reset countdown', () => {
    const normal = inlineText(
      <ModelQuotaZone
        quota={{
          fiveHour: { id: 'five_hour', name: '5-hour', usedPercent: 42 },
          weekly: { id: 'weekly', name: 'Weekly', usedPercent: 75 },
        }}
      />,
    );
    expect(normal).toBe('· 5h 58%');

    const lowWeekly = inlineText(
      <ModelQuotaZone
        quota={{
          fiveHour: { id: 'five_hour', name: '5-hour', usedPercent: 42 },
          weekly: { id: 'weekly', name: 'Weekly', usedPercent: 84 },
        }}
      />,
    );
    expect(lowWeekly).toBe('· 5h 58% · ! Weekly 16% remaining');

    expect(
      inlineText(
        <ModelQuotaZone
          quota={{
            fiveHour: { id: 'five_hour', name: '5-hour' },
            weekly: { id: 'weekly', name: 'Weekly', usedPercent: null },
          }}
        />,
      ),
    ).toBe('');
    expect(
      inlineText(
        <ModelQuotaZone
          quota={{
            fiveHour: { id: 'five_hour', name: '5-hour', usedPercent: 0.1 },
          }}
        />,
      ),
    ).toBe('· 5h 99%');

    expect(
      inlineText(
        <ModelQuotaZone
          quota={{
            fiveHour: { id: 'five_hour', name: '5-hour', usedPercent: 76 },
          }}
        />,
      ),
    ).toBe('· 5h 24% remaining');

    expect(
      inlineText(
        <ModelQuotaZone
          quota={{
            fiveHour: { id: 'five_hour', name: '5-hour', usedPercent: 75 },
          }}
        />,
      ),
    ).toBe('· 5h 25%');
  });
});
