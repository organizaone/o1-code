/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { AuthType, organizaoneLoginProvider } from '@organizaone/o1-code-core';
import { renderWithProviders } from '../../test-utils/render.js';
import type { KeypressHandler, Key } from '../contexts/KeypressContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { SignInStep } from './SignInStep.js';
import type { ProviderSetupFlow } from './useProviderSetupFlow.js';

const startMock = vi.hoisted(() => vi.fn());
const pollMock = vi.hoisted(() => vi.fn());
const checkMock = vi.hoisted(() => vi.fn());
const openBrowserMock = vi.hoisted(() => vi.fn());
const shouldLaunchMock = vi.hoisted(() => vi.fn());

vi.mock(
  '@organizaone/o1-code-core/providers/organizaone-device-auth.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/organizaone-device-auth.js')
    >()),
    startDeviceAuthorization: startMock,
    pollDeviceToken: pollMock,
  }),
);
vi.mock('@organizaone/o1-code-core/utils/secure-browser-launcher.js', () => ({
  openBrowserSecurely: openBrowserMock,
  shouldLaunchBrowser: shouldLaunchMock,
}));
vi.mock(
  '@organizaone/o1-code-core/providers/model-discovery.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/model-discovery.js')
    >()),
    checkProviderKey: checkMock,
  }),
);
vi.mock('../hooks/useKeypress.js');

let handlers: KeypressHandler[] = [];
const press = (name: string) => {
  const handler = handlers.at(-1);
  if (!handler) throw new Error('no keypress handler');
  handler({
    name,
    sequence: name,
    ctrl: false,
    meta: false,
    shift: false,
    paste: false,
  } as Key);
};

const authorization = {
  deviceCode: 'dev-1',
  userCode: 'BCDFGHJK',
  verificationUri: 'https://id.organizaone.com/device',
  verificationUriComplete: 'https://id.organizaone.com/device?code=BCDF-GHJK',
  expiresAt: Date.now() + 900_000,
  intervalMs: 5_000,
};

const token = {
  accessToken: 'o1gw_token',
  deviceId: 'dev-9',
  deviceName: 'o1-code-on-BOX',
  expiresAt: '2027-01-01T12:00:00.000Z',
};

function makeFlow(): ProviderSetupFlow {
  return {
    state: {
      provider: organizaoneLoginProvider,
      step: 'signIn',
      protocol: AuthType.USE_ANTHROPIC,
      baseUrl: 'https://api.organizaone.com',
    },
    submitSignIn: vi.fn(),
    goBack: vi.fn(),
  } as unknown as ProviderSetupFlow;
}

const settle = () => act(async () => {});

describe('SignInStep', () => {
  beforeEach(() => {
    handlers = [];
    startMock.mockReset();
    pollMock.mockReset();
    checkMock.mockReset();
    openBrowserMock.mockReset();
    shouldLaunchMock.mockReset();
    vi.mocked(useKeypress).mockImplementation((handler, options) => {
      if (options?.isActive) handlers.push(handler);
    });
    openBrowserMock.mockResolvedValue(undefined);
  });

  it('shows the code and the page, opens the browser, and hands the token to the flow', async () => {
    shouldLaunchMock.mockReturnValue(true);
    startMock.mockResolvedValue(authorization);
    let approve: (value: typeof token) => void = () => {};
    pollMock.mockReturnValue(
      new Promise<typeof token>((resolve) => {
        approve = resolve;
      }),
    );
    checkMock.mockResolvedValue({
      status: 'ok',
      models: [{ id: 'claude-sonnet-4-5' }],
    });
    const flow = makeFlow();
    const { lastFrame, unmount } = renderWithProviders(
      <SignInStep config={organizaoneLoginProvider} flow={flow} />,
    );
    await settle();

    expect(lastFrame()).toContain('BCDF-GHJK');
    expect(lastFrame()).toContain(
      'https://id.organizaone.com/device?code=BCDF-GHJK',
    );
    expect(lastFrame()).toContain('Waiting for your approval');
    expect(openBrowserMock).toHaveBeenCalledWith(
      'https://id.organizaone.com/device?code=BCDF-GHJK',
    );
    expect(startMock.mock.calls[0]![0]).toMatchObject({
      baseUrl: 'https://api.organizaone.com',
      deviceName: expect.stringMatching(/^o1-code on /),
    });

    await act(async () => {
      approve(token);
    });
    await settle();

    expect(checkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'anthropic',
        baseUrl: 'https://api.organizaone.com',
        apiKey: 'o1gw_token',
      }),
    );
    expect(flow.submitSignIn).toHaveBeenCalledWith(token, {
      status: 'ok',
      models: [{ id: 'claude-sonnet-4-5' }],
    });
    unmount();
  });

  it('tells the user to open the page elsewhere when no browser can be launched', async () => {
    shouldLaunchMock.mockReturnValue(false);
    startMock.mockResolvedValue(authorization);
    pollMock.mockReturnValue(new Promise(() => {}));
    const { lastFrame, unmount } = renderWithProviders(
      <SignInStep config={organizaoneLoginProvider} flow={makeFlow()} />,
    );
    await settle();
    expect(lastFrame()).toContain('Open this address on any device');
    expect(openBrowserMock).not.toHaveBeenCalled();
    unmount();
  });

  it('shows the reason when the sign-in fails and tries again on enter', async () => {
    shouldLaunchMock.mockReturnValue(false);
    startMock
      .mockRejectedValueOnce(
        new Error('OrganizaOne cannot start a sign-in right now.'),
      )
      .mockResolvedValue(authorization);
    pollMock.mockReturnValue(new Promise(() => {}));
    const { lastFrame, unmount } = renderWithProviders(
      <SignInStep config={organizaoneLoginProvider} flow={makeFlow()} />,
    );
    await settle();
    expect(lastFrame()).toContain('cannot start a sign-in');
    expect(lastFrame()).toContain('enter try again');

    await act(async () => {
      press('return');
    });
    await settle();
    expect(startMock).toHaveBeenCalledTimes(2);
    expect(lastFrame()).toContain('BCDF-GHJK');
    unmount();
  });

  it('cancels the wait and goes back on escape', async () => {
    shouldLaunchMock.mockReturnValue(false);
    startMock.mockResolvedValue(authorization);
    pollMock.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const flow = makeFlow();
    const { unmount } = renderWithProviders(
      <SignInStep config={organizaoneLoginProvider} flow={flow} />,
    );
    await settle();
    await act(async () => {
      press('escape');
    });
    expect(flow.goBack).toHaveBeenCalled();
    expect(flow.submitSignIn).not.toHaveBeenCalled();
    unmount();
  });
});
