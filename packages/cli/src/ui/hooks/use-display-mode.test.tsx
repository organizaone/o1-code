/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment jsdom

import type React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { ThoughtExpandedProvider } from '../contexts/ThoughtExpandedContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import { resolveDisplayMode, useDisplayMode } from './use-display-mode.js';

function render(displayMode: unknown, allExpanded = false) {
  const settings = {
    merged: { ui: { displayMode } },
  } as unknown as LoadedSettings;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SettingsContext.Provider value={settings}>
      <ThoughtExpandedProvider
        value={{ allExpanded, expandedHeadIds: new Set(), toggle: () => {} }}
      >
        {children}
      </ThoughtExpandedProvider>
    </SettingsContext.Provider>
  );
  return renderHook(() => useDisplayMode(), { wrapper }).result.current;
}

describe('useDisplayMode', () => {
  it('is active in Summary', () => {
    expect(render('summary')).toEqual({
      displayMode: 'summary',
      summaryActive: true,
    });
  });

  it('gives way to Ctrl+O full detail', () => {
    expect(render('summary', true).summaryActive).toBe(false);
  });

  it('defaults to Detailed for a missing or invalid value', () => {
    expect(render(undefined).displayMode).toBe('detailed');
    expect(render('verbose').summaryActive).toBe(false);
  });

  it('is Detailed without a settings provider', () => {
    expect(renderHook(() => useDisplayMode()).result.current.displayMode).toBe(
      'detailed',
    );
  });
});

describe('resolveDisplayMode', () => {
  it('accepts only the two modes', () => {
    expect(resolveDisplayMode('summary')).toBe('summary');
    expect(resolveDisplayMode('detailed')).toBe('detailed');
    expect(resolveDisplayMode(3)).toBe('detailed');
  });
});
