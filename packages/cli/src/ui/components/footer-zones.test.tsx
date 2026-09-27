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
  ModeZone,
  UsageZone,
  formatTokens,
  formatTurnTime,
} from './footer-zones.js';

const VS15 = String.fromCharCode(0xfe0e);
const text = (node: React.ReactElement) =>
  stripAnsi(render(node).lastFrame() ?? '').replaceAll(VS15, '');

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
  });
});
