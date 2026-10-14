/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyInfo } from '@organizaone/o1-code-core/providers/organizaone-limits.js';
import {
  formatWeeklyQuotaWarning,
  isWeeklyQuotaLow,
  selectModelQuotaFooterState,
  useModelQuotaFooter,
} from './use-model-quota-footer.js';

const fetchKeyInfoMock = vi.hoisted(() => vi.fn());

vi.mock(
  '@organizaone/o1-code-core/providers/organizaone-limits.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/organizaone-limits.js')
    >()),
    fetchKeyInfo: fetchKeyInfoMock,
  }),
);

const quota: NonNullable<KeyInfo['modelQuota']> = {
  source: 'plan',
  windows: [
    { id: 'five_hour', name: '5-hour', usedPercent: 42 },
    { id: 'weekly', name: 'Weekly', usedPercent: 84 },
  ],
};

describe('model quota footer', () => {
  beforeEach(() => {
    fetchKeyInfoMock.mockReset();
  });

  it('selects only the five-hour and weekly windows', () => {
    expect(selectModelQuotaFooterState(quota)).toEqual({
      fiveHour: quota.windows[0],
      weekly: quota.windows[1],
    });
  });

  it('does not select a window whose percentage is absent or invalid', () => {
    expect(
      selectModelQuotaFooterState({
        source: 'plan',
        windows: [
          { id: 'five_hour', name: '5-hour', usedPercent: -1 },
          { id: 'weekly', name: 'Weekly', usedPercent: null },
        ],
      }),
    ).toBeUndefined();
  });

  it('keeps zero usage so the footer can show the full remaining quota', () => {
    const fiveHour = { id: 'five_hour', name: '5-hour', usedPercent: 0 };
    expect(
      selectModelQuotaFooterState({ source: 'plan', windows: [fiveHour] }),
    ).toEqual({ fiveHour });
  });

  it('marks a weekly window low at exactly 20 percent remaining', () => {
    expect(isWeeklyQuotaLow({ name: 'Weekly', usedPercent: 80 })).toBe(true);
    expect(isWeeklyQuotaLow({ name: 'Weekly', usedPercent: 79.9 })).toBe(false);
  });

  it('warns with the quota name and remaining percentage', () => {
    expect(formatWeeklyQuotaWarning({ name: 'Weekly', usedPercent: 84 })).toBe(
      'OrganizaOne: Weekly is near its limit: 16% remains.',
    );
    expect(
      formatWeeklyQuotaWarning({ name: 'Weekly', usedPercent: 84.1 }),
    ).toBe('OrganizaOne: Weekly is near its limit: 15% remains.');
  });

  it('loads the selected OrganizaOne model only when the setting is enabled', async () => {
    const config = {
      getContentGeneratorConfig: () => ({
        baseUrl: 'https://api.organizaone.com/v1',
        apiKey: 'device-token',
        model: 'model-a',
      }),
      getCliVersion: () => '0.16.0',
    };
    const warning = vi.fn();
    fetchKeyInfoMock.mockResolvedValue({ modelQuota: quota });

    const disabled = renderHook(() =>
      useModelQuotaFooter(false, config, warning),
    );
    expect(fetchKeyInfoMock).not.toHaveBeenCalled();
    disabled.unmount();

    const { result } = renderHook(() =>
      useModelQuotaFooter(true, config, warning),
    );
    await waitFor(() => {
      expect(result.current).toEqual({
        fiveHour: quota.windows[0],
        weekly: quota.windows[1],
      });
    });
    expect(fetchKeyInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://api.organizaone.com/v1',
        apiKey: 'device-token',
        model: 'model-a',
      }),
    );
    expect(warning).toHaveBeenCalledWith(quota.windows[1]);
  });
});
