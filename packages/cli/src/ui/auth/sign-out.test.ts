/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthType } from '@organizaone/o1-code-core/utils/auth-type.js';
import {
  exportCredentialToEnv,
  forgetExportedCredentials,
  readCredential,
  writeCredential,
} from '@organizaone/o1-code-core/providers/credential-store.js';
import {
  SettingScope,
  type Settings,
  type SettingsFile,
} from '../../config/settings.js';
import {
  canSignOut,
  describeActiveLogin,
  formatSignOutPrompt,
  signOut,
  type ActiveLogin,
} from './sign-out.js';

const ENV_KEY = 'ORGANIZAONE_API_KEY';
const OTHER_ENV_KEY = 'SIGN_OUT_TEST_API_KEY';
const DEVICE_KEY = 'o1d_abcdefghijklmnopqrstuvwx1234';

type LoginConfig = Parameters<typeof describeActiveLogin>[0];

function fakeConfig(
  generator: Record<string, unknown> | undefined,
  resolved?: Record<string, unknown>,
  session?: { device: string },
): LoginConfig {
  return {
    getContentGeneratorConfig: () => generator,
    getModelsConfig: () => ({
      getResolvedModel: () => resolved,
      getCurrentRegistryBaseUrl: () => undefined,
    }),
    getO1ConnectSession: () => session,
  } as unknown as LoginConfig;
}

function fakeSettings(user: Settings) {
  const file: SettingsFile = {
    settings: structuredClone(user),
    originalSettings: structuredClone(user),
    path: '/settings/user.json',
  };
  const empty: SettingsFile = {
    settings: {},
    originalSettings: {},
    path: '/settings/none.json',
  };
  return {
    forScope: (scope: SettingScope) =>
      scope === SettingScope.User ? file : empty,
    setValue: vi.fn(),
  };
}

describe('sign-out', () => {
  let home: string;
  const originalHome = process.env['O1CODE_HOME'];
  const originalEnv = {
    [ENV_KEY]: process.env[ENV_KEY],
    [OTHER_ENV_KEY]: process.env[OTHER_ENV_KEY],
  };

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-sign-out-'));
    process.env['O1CODE_HOME'] = home;
    delete process.env[ENV_KEY];
    delete process.env[OTHER_ENV_KEY];
    forgetExportedCredentials();
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env['O1CODE_HOME'];
    else process.env['O1CODE_HOME'] = originalHome;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    forgetExportedCredentials();
    fs.rmSync(home, { recursive: true, force: true });
  });

  const organizaOneGenerator = {
    authType: AuthType.USE_ANTHROPIC,
    model: 'claude-test',
    baseUrl: 'https://api.organizaone.com',
    apiKeyEnvKey: ENV_KEY,
  };
  const organizaOneEntry = {
    id: 'claude-test',
    baseUrl: 'https://api.organizaone.com',
    envKey: ENV_KEY,
    credential: 'organizaone',
  };

  describe('describeActiveLogin', () => {
    it('is undefined when no provider is connected', () => {
      expect(describeActiveLogin(fakeConfig(undefined))).toBeUndefined();
    });

    it('names the device of a sign-in and masks its key', () => {
      writeCredential('organizaone', {
        apiKey: DEVICE_KEY,
        deviceName: 'o1-code on test-host',
      });
      exportCredentialToEnv(ENV_KEY, DEVICE_KEY);

      const login = describeActiveLogin(
        fakeConfig(organizaOneGenerator, organizaOneEntry),
      );

      expect(login).toMatchObject({
        provider: 'OrganizaOne',
        organizaOne: true,
        credentialIds: ['organizaone'],
        tunnel: false,
        envKey: ENV_KEY,
        deviceName: 'o1-code on test-host',
        maskedKey: 'o1d...1234',
      });
      expect(login?.externalEnvKey).toBeUndefined();
      expect(canSignOut(login!)).toBe(true);
    });

    it('finds the key saved under the preset id when the entry names none', () => {
      writeCredential('organizaone', { apiKey: DEVICE_KEY });

      const login = describeActiveLogin(
        fakeConfig(organizaOneGenerator, {
          ...organizaOneEntry,
          credential: undefined,
        }),
      );

      expect(login?.credentialIds).toEqual(['organizaone']);
    });

    it('reports a key set outside the store as not removable', () => {
      writeCredential('organizaone', { apiKey: DEVICE_KEY });
      process.env[ENV_KEY] = 'set-by-the-shell';

      const login = describeActiveLogin(
        fakeConfig(organizaOneGenerator, organizaOneEntry),
      );

      expect(login?.externalEnvKey).toBe(ENV_KEY);
      expect(canSignOut(login!)).toBe(false);
    });

    it('names a provider given by URL by its host', () => {
      writeCredential('custom-abc', { apiKey: 'sk-custom-0123456789abcdef' });

      const login = describeActiveLogin(
        fakeConfig(
          {
            authType: AuthType.USE_OPENAI,
            model: 'local-model',
            baseUrl: 'https://llm.example.com/v1',
            apiKeyEnvKey: OTHER_ENV_KEY,
          },
          {
            id: 'local-model',
            baseUrl: 'https://llm.example.com/v1',
            envKey: OTHER_ENV_KEY,
            credential: 'custom-abc',
          },
        ),
      );

      expect(login).toMatchObject({
        provider: 'llm.example.com',
        organizaOne: false,
        credentialIds: ['custom-abc'],
      });
    });

    it('describes the tunnel by the device of its session', () => {
      const login = describeActiveLogin(
        fakeConfig(
          {
            authType: AuthType.USE_ANTHROPIC,
            model: 'claude-test',
            baseUrl: 'http://127.0.0.1:4100',
            connection: 'o1-connect',
          },
          {
            id: 'claude-test',
            baseUrl: 'https://api.organizaone.com',
            connection: 'o1-connect',
          },
          { device: 'office laptop' },
        ),
      );

      expect(login).toMatchObject({
        provider: 'OrganizaOne',
        tunnel: true,
        credentialIds: [],
        deviceName: 'office laptop',
      });
      expect(canSignOut(login!)).toBe(true);
    });

    it('has nothing to sign out of when no key is saved', () => {
      const login = describeActiveLogin(
        fakeConfig(organizaOneGenerator, organizaOneEntry),
      );

      expect(login?.credentialIds).toEqual([]);
      expect(canSignOut(login!)).toBe(false);
    });
  });

  describe('formatSignOutPrompt', () => {
    const login: ActiveLogin = {
      provider: 'OrganizaOne',
      organizaOne: true,
      credentialIds: ['organizaone'],
      tunnel: false,
      deviceName: 'o1-code on test-host',
      maskedKey: 'o1d...1234',
    };

    it('names the provider, the device and the masked key', () => {
      const prompt = formatSignOutPrompt(login);

      expect(prompt).toContain('Sign out of OrganizaOne?');
      expect(prompt).toContain('Device: o1-code on test-host');
      expect(prompt).toContain('Key: o1d...1234');
      expect(prompt).toContain('stays on your account page');
      expect(prompt).not.toContain(DEVICE_KEY);
    });

    it('says the key stays valid at another provider', () => {
      const prompt = formatSignOutPrompt({
        ...login,
        provider: 'llm.example.com',
        organizaOne: false,
        deviceName: undefined,
      });

      expect(prompt).toContain('Sign out of llm.example.com?');
      expect(prompt).not.toContain('Device:');
      expect(prompt).toContain('until you revoke it at the provider');
    });
  });

  describe('signOut', () => {
    it('removes the key, its reference and the exported copy, then clears the session', async () => {
      writeCredential('organizaone', { apiKey: DEVICE_KEY });
      exportCredentialToEnv(ENV_KEY, DEVICE_KEY);
      const settings = fakeSettings({
        modelProviders: { anthropic: [organizaOneEntry] },
      } as Settings);
      const config = { clearAuth: vi.fn().mockResolvedValue(undefined) };
      const forgetTunnel = vi.fn().mockResolvedValue(undefined);
      const login = describeActiveLogin(
        fakeConfig(organizaOneGenerator, organizaOneEntry),
      )!;

      await signOut(login, { config, settings, forgetTunnel });

      expect(readCredential('organizaone')).toBeUndefined();
      expect(process.env[ENV_KEY]).toBeUndefined();
      expect(settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'modelProviders.anthropic',
        [
          {
            id: 'claude-test',
            baseUrl: 'https://api.organizaone.com',
            envKey: ENV_KEY,
          },
        ],
      );
      expect(config.clearAuth).toHaveBeenCalledTimes(1);
      expect(forgetTunnel).not.toHaveBeenCalled();
    });

    it('forgets the tunnel configuration of a device code', async () => {
      const config = { clearAuth: vi.fn().mockResolvedValue(undefined) };
      const forgetTunnel = vi.fn().mockResolvedValue(undefined);

      await signOut(
        {
          provider: 'OrganizaOne',
          organizaOne: true,
          credentialIds: [],
          tunnel: true,
        },
        { config, settings: fakeSettings({}), forgetTunnel },
      );

      expect(forgetTunnel).toHaveBeenCalledTimes(1);
      expect(config.clearAuth).toHaveBeenCalledTimes(1);
    });

    it('keeps the session when a key cannot be removed', async () => {
      const config = { clearAuth: vi.fn().mockResolvedValue(undefined) };

      await expect(
        signOut(
          {
            provider: 'OrganizaOne',
            organizaOne: true,
            credentialIds: ['Not A Valid Id'],
            tunnel: false,
          },
          { config, settings: fakeSettings({}) },
        ),
      ).rejects.toThrow('Invalid credential id');
      expect(config.clearAuth).not.toHaveBeenCalled();
    });
  });
});
