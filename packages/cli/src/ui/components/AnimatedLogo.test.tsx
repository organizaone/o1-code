/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedLogo } from './AnimatedLogo.js';
import { O1Logo } from './O1Logo.js';
import { LOGO_ANIMATIONS, LOGO_FRAME_MS } from '../utils/logo-animation.js';

const lines = (frame: string | undefined) =>
  stripAnsi(frame ?? '')
    .split('\n')
    .map((line) => line.trimEnd());

const STATIC = lines(render(<O1Logo />).lastFrame());
const REST = ['', ...STATIC];

describe('<AnimatedLogo />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws three rows: the blank row above the header and the two logo rows', () => {
    const { lastFrame } = render(<AnimatedLogo variant="pulo" />);
    expect(lines(lastFrame())).toHaveLength(3);
  });

  it('plays one pass, then rests on the static logo and reports it once', () => {
    const onDone = vi.fn();
    const { lastFrame } = render(
      <AnimatedLogo variant="onda" onDone={onDone} />,
    );
    expect(lines(lastFrame())).not.toEqual(REST);
    act(() => {
      vi.advanceTimersByTime(LOGO_FRAME_MS * 3);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(LOGO_FRAME_MS * LOGO_ANIMATIONS.onda.length);
    });
    expect(lines(lastFrame())).toEqual(REST);
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(LOGO_FRAME_MS * 10);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rests at once when stop turns true mid-pass', () => {
    const onDone = vi.fn();
    const { lastFrame, rerender } = render(
      <AnimatedLogo variant="come" onDone={onDone} />,
    );
    act(() => {
      vi.advanceTimersByTime(LOGO_FRAME_MS * 5);
    });
    expect(lines(lastFrame())).not.toEqual(REST);
    rerender(<AnimatedLogo variant="come" stop onDone={onDone} />);
    expect(lines(lastFrame())).toEqual(REST);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its interval on unmount', () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval');
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<AnimatedLogo variant="bola" />);
    const id = setSpy.mock.results.find(
      (_, i) => setSpy.mock.calls[i]![1] === LOGO_FRAME_MS,
    )?.value;
    expect(id).toBeDefined();
    act(() => {
      unmount();
    });
    expect(clearSpy).toHaveBeenCalledWith(id);
  });
});
