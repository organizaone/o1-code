/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
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
import { t } from '../../i18n/index.js';
import { maskApiKey } from './useAuth.js';

/** What the session is signed in with, as the sign-out confirmation shows it. */
export interface ActiveLogin {
  /** The preset's name, or the endpoint's host for a provider given by URL. */
  provider: string;
  /** Whether the model is reached through OrganizaOne. */
  organizaOne: boolean;
  /** Saved keys the active model reads: files in the credential store. */
  credentialIds: string[];
  /** The model is reached through the pinned tunnel, set up from a code. */
  tunnel: boolean;
  /** The variable the model's key is read from, when it names one. */
  envKey?: string;
  /**
   * Set when that variable was set outside o1-code: the key is then not
   * o1-code's to remove.
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

/** Whether o1-code holds something of this login that a sign-out removes. */
export function canSignOut(login: ActiveLogin): boolean {
  return (
    !login.externalEnvKey && (login.tunnel || login.credentialIds.length > 0)
  );
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
  if (login.maskedKey) {
    lines.push(`- ${t('Key: {{key}}', { key: login.maskedKey })}`);
  }
  if (login.tunnel) {
    lines.push(
      `- ${t('Connection: {{name}}', { name: t('o1-gateway device code') })}`,
    );
  }
  lines.push(
    '',
    login.organizaOne
      ? t(
          'The saved key is removed from this machine and this session is disconnected. The device stays on your account page until you remove it there.',
        )
      : t(
          'The saved key is removed from this machine and this session is disconnected. The key itself stays valid until you revoke it at the provider.',
        ),
  );
  return lines.join('\n');
}

/**
 * Removes what o1-code saved for the login (the keys, their references in the
 * settings, the copy exported to this process, the tunnel's configuration)
 * and signs the session out. Nothing is revoked at the provider.
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
  // Before anything else is awaited: removing the references changed the
  // settings, and the reload that follows must not find a session to refresh.
  await config.clearAuth();
  if (login.tunnel) await forgetTunnel();
}
