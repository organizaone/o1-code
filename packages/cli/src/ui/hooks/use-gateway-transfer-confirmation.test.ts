// @vitest-environment jsdom
/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import { confirmGatewayTransfer } from '@organizaone/o1-code-core/providers/gateway-transfer.js';
import { useGatewayTransferConfirmation } from './use-gateway-transfer-confirmation.js';

describe('gateway account consent', () => {
  it('explains a group transition without inventing a destination member', async () => {
    const config = {} as Config;
    const { result } = renderHook(() => useGatewayTransferConfirmation(config));
    let answer!: Promise<boolean>;
    act(() => {
      answer = confirmGatewayTransfer(config, {
        source: 'o1gw/group/copilot/1/auto',
        destination: 'another eligible group account',
        purpose: 'group-transfer',
      });
    });
    expect(String(result.current?.prompt)).toContain(
      'another eligible account',
    );
    expect(result.current?.defaultDeny).toBe(true);
    act(() => result.current?.onConfirm(false));
    expect(await answer).toBe(false);
  });

  it('names the exact manual destination when leaving a group', async () => {
    const config = {} as Config;
    const { result } = renderHook(() => useGatewayTransferConfirmation(config));
    let answer!: Promise<boolean>;
    act(() => {
      answer = confirmGatewayTransfer(config, {
        source: 'o1gw/group/copilot/1/auto',
        destination: 'o1gw/own/claude/7/sonnet',
      });
    });
    expect(String(result.current?.prompt)).toContain(
      'o1gw/own/claude/7/sonnet',
    );
    expect(String(result.current?.prompt)).not.toContain('eligible account');
    expect(result.current?.defaultDeny).toBe(true);
    act(() => result.current?.onConfirm(false));
    expect(await answer).toBe(false);
  });

  it('requires an explicit positive answer and defaults to cancel', async () => {
    const config = {} as Config;
    const { result } = renderHook(() => useGatewayTransferConfirmation(config));
    let answer!: Promise<boolean>;
    act(() => {
      answer = confirmGatewayTransfer(config, {
        source: 'source-account',
        destination: 'destination-account',
      });
    });
    expect(result.current?.defaultDeny).toBe(true);
    expect(String(result.current?.prompt)).toContain('destination-account');
    act(() => result.current?.onConfirm(false));
    expect(await answer).toBe(false);
    expect(result.current).toBeNull();
    act(() => {
      answer = confirmGatewayTransfer(config, {
        source: 'source-account',
        destination: 'destination-account',
      });
    });
    act(() => result.current?.onConfirm(true));
    expect(await answer).toBe(true);
  });

  it('cancels on abort or unmount and never authorizes an unattended client', async () => {
    const config = {} as Config;
    expect(
      await confirmGatewayTransfer(config, {
        source: 'source',
        destination: 'target',
      }),
    ).toBe(false);
    const { result, unmount } = renderHook(() =>
      useGatewayTransferConfirmation(config),
    );
    const controller = new AbortController();
    let answer!: Promise<boolean>;
    act(() => {
      answer = confirmGatewayTransfer(config, {
        source: 'source',
        destination: 'target',
        signal: controller.signal,
      });
    });
    act(() => controller.abort());
    expect(await answer).toBe(false);
    expect(result.current).toBeNull();
    act(() => {
      answer = confirmGatewayTransfer(config, {
        source: 'source',
        destination: 'target',
      });
    });
    unmount();
    expect(await answer).toBe(false);
  });
});
