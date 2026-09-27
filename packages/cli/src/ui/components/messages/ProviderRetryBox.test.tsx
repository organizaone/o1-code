/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { ProviderRetryBox } from './ProviderRetryBox.js';

const retry = {
  message: 'Provider error 429 · rate limit',
  remainingSec: 20,
  attempt: 1,
  maxRetries: 3,
};

describe('ProviderRetryBox', () => {
  it('frames the provider error with the live countdown', () => {
    const rows = (
      render(<ProviderRetryBox retry={retry} />).lastFrame() ?? ''
    ).split('\n');
    expect(rows[0]!.trimStart().startsWith('╭')).toBe(true);
    const body = rows.join('\n');
    expect(body).toContain('Provider error 429 · rate limit');
    expect(body).toContain('Retrying in 20s — esc to give up');
  });

  it('says it is retrying once the countdown reaches zero', () => {
    const frame = render(
      <ProviderRetryBox retry={{ ...retry, remainingSec: 0 }} />,
    ).lastFrame();
    expect(frame).toContain('Retrying…');
    expect(frame).not.toContain('Retrying in');
  });
});
