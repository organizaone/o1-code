/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { Config } from '@organizaone/o1-code-core/config/config.js';
import { findProviderByCredentials } from '@organizaone/o1-code-core/providers/all-providers.js';
import {
  credentialIdForProvider,
  isExportedCredentialEnv,
  isValidCredentialId,
  readCredential,
  withdrawExportedCredential,
} from '@organizaone/o1-code-core/providers/credential-store.js';
import { forgetO1Connect } from '@organizaone/o1-code-core/providers/o1-connect/session.js';
import { customProvider } from '@organizaone/o1-code-core/providers/presets/custom-provider.js';
import {
  organizaoneProvider,
  reachesOrganizaOne,
} from '@organizaone/o1-code-core/providers/presets/organizaone.js';
import { logoutProvider, type LogoutSettings } from '../../commands/auth.js';
import { SettingScope } from '../../config/settings.js';
import { t } from '../../i18n/index.js';
import { maskApiKey } from './useAuth.js';

/** What the session is signed in with, as the sign-out confirmation shows it. */
export interface ActiveLogin {
  /** The preset's name, or the endpoint's host for a provider given by URL. */
  provider: string;
  /** Whether the model is reached through OrganizaOne. */
  organizaOne: boolean;
  /** A server on this machine: its key is a placeholder, not an account's. */
  local?: boolean;
  /** Saved keys the active model reads: files in the credential store. */
  credentialIds: string[];
  /** The model is reached through the pinned tunnel, set up from a code. */
  tunnel: boolean;
  /** The variable the model's key is read from, when it names one. */
  envKey?: string;
  /**
   * Set when that variable was set outside o1-code: the key is then not
   * o1-code's to remove, and the sign-out leaves the variable alone.
   */
  externalEnvKey?: string;
  /** The device's name on the account page, when the key came from a sign-in. */
  deviceName?: string;
  /** The saved key, masked. */
  maskedKey?: string;
}

function hostOf(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined;
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * The login of the active model, or `undefined` when no provider is
 * connected. The keys are found as the model resolves them: the credential
 * its entry names, then the one saved under its preset's id.
 */
export function describeActiveLogin(
  config: Pick<
    Config,
    'getContentGeneratorConfig' | 'getModelsConfig' | 'getO1ConnectSession'
  >,
): ActiveLogin | undefined {
  const generator = config.getContentGeneratorConfig();
  const authType = generator?.authType;
  if (!generator || !authType) return undefined;

  const models = config.getModelsConfig();
  const resolved = models.getResolvedModel(
    authType,
    generator.model,
    models.getCurrentRegistryBaseUrl(),
  );
  const tunnel =
    (resolved?.connection ?? generator.connection) === 'o1-connect';
  // Through the tunnel the generator points at a loopback endpoint; the entry
  // keeps the address that names the provider.
  const baseUrl = resolved?.baseUrl ?? generator.baseUrl;
  const envKey = (resolved?.envKey ?? generator.apiKeyEnvKey) || undefined;
  const preset = findProviderByCredentials(baseUrl, envKey);
  const organizaOne = reachesOrganizaOne({
    baseUrl,
    connection: tunnel ? 'o1-connect' : undefined,
    model: generator.model,
  });

  const credentialIds = [
    ...new Set([
      ...(resolved?.credential ? [resolved.credential] : []),
      ...(preset ? [credentialIdForProvider(preset.id)] : []),
    ]),
  ].filter((id) => isValidCredentialId(id) && readCredential(id));
  const saved = credentialIds[0] ? readCredential(credentialIds[0]) : undefined;
  const external =
    envKey && process.env[envKey] && !isExportedCredentialEnv(envKey);

  return {
    provider: organizaOne
      ? organizaoneProvider.label
      : preset && preset.id !== customProvider.id
        ? t(preset.label)
        : (hostOf(baseUrl) ?? authType),
    organizaOne,
    ...(preset?.uiGroup === 'local' ? { local: true } : {}),
    credentialIds,
    tunnel,
    ...(envKey ? { envKey } : {}),
    ...(external ? { externalEnvKey: envKey } : {}),
    ...(tunnel && config.getO1ConnectSession()?.device
      ? { deviceName: config.getO1ConnectSession()?.device }
      : saved?.deviceName
        ? { deviceName: saved.deviceName }
        : {}),
    ...(saved ? { maskedKey: maskApiKey(saved.apiKey) } : {}),
  };
}

/** What a sign-out does on this machine, then what it leaves as it is. */
function describeSignOutEffect(login: ActiveLogin): string {
  const saved = login.credentialIds.length > 0;
  const removed = login.local
    ? t(
        'The connection saved on this machine is removed and this session is disconnected.',
      )
    : saved
      ? t(
          'The saved key is removed from this machine and this session is disconnected.',
        )
      : login.tunnel
        ? t(
            'The connection saved on this machine is removed and this session is disconnected.',
          )
        : t('This session is disconnected.');
  const kept = login.externalEnvKey
    ? t(
        'The environment variable {{envKey}} is set outside O1-Code and stays as it is.',
        { envKey: login.externalEnvKey },
      )
    : login.organizaOne && (saved || login.tunnel)
      ? t('The device stays on your account page until you remove it there.')
      : login.local
        ? t('The server on this machine is not changed.')
        : saved
          ? t('The key itself stays valid until you revoke it at the provider.')
          : t('No key is saved for this provider.');
  return `${removed} ${kept}`;
}

/** The confirmation's text (Markdown): which account, and what is removed. */
export function formatSignOutPrompt(login: ActiveLogin): string {
  const lines = [
    `**${t('Sign out of {{provider}}?', { provider: login.provider })}**`,
    '',
  ];
  if (login.deviceName) {
    lines.push(`- ${t('Device: {{name}}', { name: login.deviceName })}`);
  }
  if (login.externalEnvKey) {
    lines.push(
      `- ${t('Key: {{key}}', {
        key: t('environment variable {{envKey}}', {
          envKey: login.externalEnvKey,
        }),
      })}`,
    );
  } else if (login.maskedKey && !login.local) {
    lines.push(`- ${t('Key: {{key}}', { key: login.maskedKey })}`);
  }
  if (login.tunnel) {
    lines.push(
      `- ${t('Connection: {{name}}', { name: t('o1-gateway device code') })}`,
    );
  }
  lines.push('', describeSignOutEffect(login));
  return lines.join('\n');
}

const SELECTED_AUTH_TYPE = 'security.auth.selectedType';

/**
 * Signs the session out, whatever it signed in with: removes what o1-code
 * saved for the login (the keys, their references in the settings, the copy
 * exported to this process, the tunnel's configuration) and the choice of
 * provider, so the next start asks which one to connect instead of going back
 * to this one. Nothing is revoked at the provider, and a key the environment
 * holds is not o1-code's to remove.
 */
export async function signOut(
  login: ActiveLogin,
  {
    config,
    settings,
    forgetTunnel = forgetO1Connect,
  }: {
    config: Pick<Config, 'clearAuth'>;
    settings: LogoutSettings;
    forgetTunnel?: () => Promise<void>;
  },
): Promise<void> {
  for (const id of login.credentialIds) logoutProvider(id, settings);
  if (login.envKey) withdrawExportedCredential(login.envKey);
  for (const scope of [SettingScope.User, SettingScope.Workspace]) {
    const selected =
      settings.forScope(scope).originalSettings.security?.auth?.selectedType;
    if (selected !== undefined) {
      settings.setValue(scope, SELECTED_AUTH_TYPE, undefined);
    }
  }
  // Before anything else is awaited: the lines above changed the settings,
  // and the reload that follows must not find a session to refresh.
  await config.clearAuth();
  if (login.tunnel) await forgetTunnel();
}
