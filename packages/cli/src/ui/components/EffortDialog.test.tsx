/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { EffortDialog } from './EffortDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';

// Mock only the keypress hook so we can exercise the Escape handler directly.
// RadioButtonSelect is left real so the rendered frame contains the tier list.
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));
const mockedUseKeypress = vi.mocked(useKeypress);

describe('EffortDialog', () => {
  beforeEach(() => {
    mockedUseKeypress.mockClear();
  });

  it('renders the title and all five reasoning-effort tiers', () => {
    const { lastFrame } = renderWithProviders(
      <EffortDialog onSelect={vi.fn()} />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Reasoning Effort');
    for (const tier of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(frame).toContain(tier);
    }
    expect(frame).toContain('Use Enter to select, Esc to cancel');
  });

  it('offers default first and starts on it when no effort is set', () => {
    const { lastFrame } = renderWithProviders(
      <EffortDialog onSelect={vi.fn()} />,
    );

    const lines = (lastFrame() ?? '').split('\n');
    const defaultLine = lines.find((line) => line.includes('1. default'));
    expect(defaultLine).toBeDefined();
    expect(lines.find((line) => line.includes('2. low'))).toBeDefined();
    // The highlighted row carries the selection marker.
    expect(defaultLine).toMatch(/[●❯>]/);
  });

  it('starts on the configured tier', () => {
    const { lastFrame } = renderWithProviders(
      <EffortDialog onSelect={vi.fn()} currentEffort="high" />,
    );

    expect(lastFrame() ?? '').toMatch(/● 4\. high|›\s*4\. high|4\. high/);
  });

  it('lists only the tiers the resolved model exposes', () => {
    const { lastFrame } = renderWithProviders(
      <EffortDialog onSelect={vi.fn()} efforts={['high', 'max']} />,
    );

    const frame = lastFrame() ?? '';
    // `default`, then the two tiers.
    expect(frame).toContain('3.');
    expect(frame).not.toContain('4.');
    expect(frame).not.toContain('medium');
    expect(frame).not.toContain('xhigh');
  });

  it('reports a configured tier the resolved model does not expose', () => {
    // A global `model.reasoningEffort` carried over from another model reaches
    // the picker; mapping that miss onto the first listed tier would read as
    // "high is current" and a bare Enter would persist it over the stored value.
    const { lastFrame } = renderWithProviders(
      <EffortDialog
        onSelect={vi.fn()}
        currentEffort="low"
        efforts={['high', 'max']}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('low is not available for this model');
    expect(frame).not.toContain('No effort configured');
  });

  it('registers an active Escape handler that cancels with undefined', () => {
    const onSelect = vi.fn();
    renderWithProviders(<EffortDialog onSelect={onSelect} />);

    expect(mockedUseKeypress).toHaveBeenCalled();
    const [handler, options] = mockedUseKeypress.mock.calls[0];
    expect(options).toEqual({ isActive: true });

    handler({
      name: 'escape',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      sequence: '',
    });

    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('does not cancel on non-Escape keys', () => {
    const onSelect = vi.fn();
    renderWithProviders(<EffortDialog onSelect={onSelect} />);

    const [handler] = mockedUseKeypress.mock.calls[0];
    handler({
      name: 'return',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      sequence: '\r',
    });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
