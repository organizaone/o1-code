/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import type { SessionListItem } from '@organizaone/o1-code-core/services/sessionService.js';
import { WelcomeScreen } from './WelcomeScreen.js';
import { primeRecentSessionsForTest } from '../utils/recent-sessions.js';

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const HOUR = 3_600_000;

const session = (id: string, prompt: string, ageHours: number) =>
  ({
    sessionId: id,
    prompt,
    mtime: NOW - ageHours * HOUR,
  }) as SessionListItem;

describe('WelcomeScreen', () => {
  it('welcomes, explains and lists how to start', () => {
    const frame = render(
      <WelcomeScreen sessions={[]} currentSessionId="now" now={NOW} />,
    ).lastFrame();
    expect(frame).toContain('Welcome to o1-code.');
    expect(frame).toContain('GETTING STARTED');
    expect(frame).toContain('/init');
    expect(frame).toContain('AGENTS.md');
    expect(frame).not.toContain('RECENT SESSIONS');
  });

  it('shows primed sessions on its very first render', () => {
    // Without virtualized history the screen sits in Ink's <Static>, which
    // renders it once: the sessions must be there before that render.
    primeRecentSessionsForTest('/project', [
      session('a', 'prepare the production build', 2),
    ]);
    const frame = render(
      <WelcomeScreen currentSessionId="now" cwd="/project" now={NOW} />,
    ).lastFrame();
    expect(frame).toContain('prepare the production build');
  });

  it('keeps each session to one row: the first prompt line, apart from its age', () => {
    const frame = render(
      <WelcomeScreen
        sessions={[
          session('a', 'first line\nsecond line\nthird line', 24 * 21),
        ]}
        currentSessionId="now"
        now={NOW}
      />,
    ).lastFrame();
    expect(frame).toMatch(/3 weeks ago\s+first line/);
    expect(frame).not.toContain('second line');
  });

  it('skips sessions with nothing to name them by', () => {
    const frame = render(
      <WelcomeScreen
        sessions={[session('empty', '', 1), session('a', 'real work', 2)]}
        currentSessionId="now"
        now={NOW}
      />,
    ).lastFrame();
    const rows = (frame ?? '').split('\n').filter((row) => /ago/.test(row));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('real work');
  });

  it('lists up to three recent sessions, not the current one', () => {
    const frame = render(
      <WelcomeScreen
        sessions={[
          session('now', 'current session', 0),
          session('a', 'prepare the production build', 2),
          session('b', 'fix the daemon integration test', 30),
          session('c', 'third', 50),
          session('d', 'fourth', 90),
        ]}
        currentSessionId="now"
        now={NOW}
      />,
    ).lastFrame();
    expect(frame).toContain('RECENT SESSIONS');
    expect(frame).not.toContain('current session');
    expect(frame).toMatch(/2 h ago\s+prepare the production build/);
    expect(frame).toMatch(/yesterday\s+fix the daemon integration test/);
    expect(frame).toContain('third');
    expect(frame).not.toContain('fourth');
    expect(frame).toContain('/resume');
  });
});
