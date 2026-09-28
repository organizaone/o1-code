/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Box } from 'ink';
import { UpdateNotice } from './UpdateNotice.js';

const frame = (node: React.ReactElement) =>
  (
    render(
      <Box width={60} flexDirection="column">
        {node}
      </Box>,
    ).lastFrame() ?? ''
  ).split('\n');

describe('<UpdateNotice />', () => {
  it('sets the title into the top edge of a full-width frame', () => {
    const lines = frame(<UpdateNotice status="installed" version="0.2.2" />);
    const top = lines.find((line) => line.includes('Update'))!;
    expect(top).toMatch(/^╭─ Update ─+╮$/);
    expect([...top]).toHaveLength(60);
    expect(lines.join('\n')).toContain('O1-Code 0.2.2 installed');
    expect(lines.join('\n')).toContain(
      'It takes effect the next time you open O1-Code.',
    );
  });

  it('lists the highlights, what was left out and the full notes', () => {
    const text = frame(
      <UpdateNotice
        status="whats_new"
        version="0.2.2"
        fromVersion="0.2.1"
        highlights={['First change', 'Second change']}
        moreCount={3}
        notesUrl="https://example.test/v0.2.2"
      />,
    ).join('\n');
    expect(text).toContain("What's new in 0.2.2");
    expect(text).toContain('Updated from 0.2.1 to 0.2.2');
    expect(text).toContain('First change');
    expect(text).toContain(
      'and 3 more · full notes: https://example.test/v0.2.2',
    );
  });

  it('names the version and the reason when the update failed', () => {
    const text = frame(
      <UpdateNotice status="failed" version="0.2.2" text="npm exited 1" />,
    ).join('\n');
    expect(text).toContain('The update to 0.2.2 failed');
    expect(text).toContain('npm exited 1');
  });
});
