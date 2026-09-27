/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Spinner } from './RespondingSpinner.js';

// The test renderer emits no ANSI, so the Text colour is printed instead.
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    Text: ({
      color,
      children,
    }: {
      color?: string;
      children?: React.ReactNode;
    }) => (
      <actual.Text>
        {color ? `[${color}]` : ''}
        {children}
      </actual.Text>
    ),
  };
});

describe('<Spinner /> colour', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('paints the frame in the colour it is given', () => {
    expect(render(<Spinner color="red" />).lastFrame()).toContain('[red]');
  });

  it('paints the tmux frame in the colour it is given', () => {
    vi.stubEnv('TMUX', '/tmp/tmux-1000/default,12345,0');
    expect(render(<Spinner color="red" />).lastFrame()).toContain('[red]');
  });
});
