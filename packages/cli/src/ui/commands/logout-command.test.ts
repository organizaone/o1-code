/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import { logoutCommand } from './logout-command.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  describeActiveLogin,
  signOut,
  type ActiveLogin,
} from '../auth/sign-out.js';

vi.mock('../auth/sign-out.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/sign-out.js')>()),
  describeActiveLogin: vi.fn(),
  signOut: vi.fn(),
}));

const login: ActiveLogin = {
  provider: 'OrganizaOne',
  organizaOne: true,
  credentialIds: ['organizaone'],
  tunnel: false,
  envKey: 'ORGANIZAONE_API_KEY',
  deviceName: 'o1-code on test-host',
  maskedKey: 'o1d...1234',
};

const config = {} as Config;

function run(overrides: Parameters<typeof createMockCommandContext>[0] = {}) {
  const context = createMockCommandContext({
    services: { config },
    invocation: { raw: '/logout', name: 'logout', args: '' },
    ...overrides,
  });
  return {
    context,
    result: logoutCommand.action!(context, ''),
  };
}

describe('logoutCommand', () => {
  beforeEach(() => {
    vi.mocked(describeActiveLogin).mockReset();
    vi.mocked(signOut).mockReset().mockResolvedValue(undefined);
  });

  it('is an interactive command named logout', () => {
    expect(logoutCommand.name).toBe('logout');
    expect(logoutCommand.altNames).toEqual(['disconnect']);
    expect(logoutCommand.supportedModes).toEqual(['interactive']);
    expect(logoutCommand.description).toBe(
      'Sign out of the connected provider',
    );
  });

  it('says so when no provider is connected', async () => {
    vi.mocked(describeActiveLogin).mockReturnValue(undefined);

    expect(await run().result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No provider is connected. Use /auth to connect one.',
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<ActiveLogin>]>([
    [
      'a key the environment holds',
      { credentialIds: [], externalEnvKey: 'ORGANIZAONE_API_KEY' },
    ],
    ['a provider with no saved key', { credentialIds: [], envKey: undefined }],
    ['a device code', { credentialIds: [], tunnel: true }],
  ])('asks and signs out of %s', async (_name, overrides) => {
    const active = { ...login, ...overrides };
    vi.mocked(describeActiveLogin).mockReturnValue(active);

    expect(await run().result).toMatchObject({ type: 'confirm_action' });
    expect(signOut).not.toHaveBeenCalled();

    const { context, result } = run({ overwriteConfirmed: true });

    expect(await result).toEqual({ type: 'dialog', dialog: 'auth' });
    expect(signOut).toHaveBeenCalledWith(active, {
      config,
      settings: context.services.settings,
    });
  });

  it('asks first, naming the connected account', async () => {
    vi.mocked(describeActiveLogin).mockReturnValue(login);

    const result = await run().result;

    expect(result).toMatchObject({
      type: 'confirm_action',
      confirmLabel: 'Sign out',
      cancelLabel: 'Cancel',
      defaultDeny: true,
      originalInvocation: { raw: '/logout' },
    });
    const { prompt } = result as { prompt: string };
    expect(prompt).toContain('Sign out of OrganizaOne?');
    expect(prompt).toContain('o1-code on test-host');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out once confirmed and opens the sign-in dialog', async () => {
    vi.mocked(describeActiveLogin).mockReturnValue(login);

    const { context, result } = run({ overwriteConfirmed: true });

    expect(await result).toEqual({ type: 'dialog', dialog: 'auth' });
    expect(signOut).toHaveBeenCalledWith(login, {
      config,
      settings: context.services.settings,
    });
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        text: 'Signed out of OrganizaOne.',
      }),
      expect.any(Number),
    );
  });

  it('reports a failure and leaves the dialog closed', async () => {
    vi.mocked(describeActiveLogin).mockReturnValue(login);
    vi.mocked(signOut).mockRejectedValue(new Error('disk is read-only'));

    const { context, result } = run({ overwriteConfirmed: true });

    expect(await result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Could not sign out: disk is read-only',
    });
    expect(context.ui.addItem).not.toHaveBeenCalled();
  });
});
