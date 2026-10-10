/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../../core/contentGenerator.js';
import { BRAND } from '../../generated/brand.js';
import type { ProviderConfig } from '../types.js';

/** The proxy host is a constant of the preset; another host is a Custom provider. */
export const ORGANIZAONE_ANTHROPIC_BASE_URL = 'https://api.organizaone.com';
export const ORGANIZAONE_OPENAI_BASE_URL = 'https://api.organizaone.com/v1';
export const ORGANIZAONE_ENV_KEY = 'ORGANIZAONE_API_KEY';

/**
 * The proxy's API host. The hosts that serve pages (sign-in approval on
 * `id.`, the account on `account.`) are not the API: neither is the proxy for
 * o1-code.
 */
const ORGANIZAONE_HOST = new URL(ORGANIZAONE_ANTHROPIC_BASE_URL).hostname;

/**
 * Whether requests go to the OrganizaOne proxy. Decided from the URL rather
 * than from the preset, so a provider saved before a release also gets what
 * the proxy expects.
 */
export function isOrganizaOneBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).hostname.toLowerCase() === ORGANIZAONE_HOST;
  } catch {
    return false;
  }
}

/**
 * Whether requests through this configuration reach the OrganizaOne proxy:
 * at its URL, or through its pinned tunnel, whose URL is a loopback address.
 */
export function reachesOrganizaOne(config: {
  baseUrl?: string;
  connection?: string;
}): boolean {
  return (
    config.connection === 'o1-connect' || isOrganizaOneBaseUrl(config.baseUrl)
  );
}

/**
 * The proxy records the calling agent from `X-Title` before `User-Agent`
 * (o1-gateway, request-origin.ts).
 */
export const ORGANIZAONE_CLIENT_HEADERS: Readonly<Record<string, string>> = {
  'X-Title': BRAND.productName,
};

export const organizaoneProvider: ProviderConfig = {
  id: 'organizaone',
  label: 'OrganizaOne',
  description: 'Connect to OrganizaOne with your key',
  protocol: AuthType.USE_ANTHROPIC,
  protocolOptions: [AuthType.USE_ANTHROPIC, AuthType.USE_OPENAI],
  baseUrlByProtocol: {
    [AuthType.USE_ANTHROPIC]: ORGANIZAONE_ANTHROPIC_BASE_URL,
    [AuthType.USE_OPENAI]: ORGANIZAONE_OPENAI_BASE_URL,
  },
  envKey: ORGANIZAONE_ENV_KEY,
  apiKeyPlaceholder: 'device token from the OrganizaOne console',
  // Both protocols list the account's models at /v1/models.
  supportsModelDiscovery: true,
  modelNamePrefix: 'OrganizaOne',
  uiGroup: 'organizaone',
};

/**
 * Sign in with the OrganizaOne account: the proxy's device authorization
 * (RFC 8628) hands o1-code a device token, which is then exactly the key the
 * `organizaone` preset asks for. Same proxy, same env key, same credential:
 * only the way the token arrives differs.
 */
export const organizaoneLoginProvider: ProviderConfig = {
  id: 'organizaone-login',
  label: 'Sign in with your account',
  description:
    'Approve this device in your browser; the models come from OrganizaOne',
  protocol: AuthType.USE_ANTHROPIC,
  protocolOptions: [AuthType.USE_ANTHROPIC, AuthType.USE_OPENAI],
  baseUrlByProtocol: {
    [AuthType.USE_ANTHROPIC]: ORGANIZAONE_ANTHROPIC_BASE_URL,
    [AuthType.USE_OPENAI]: ORGANIZAONE_OPENAI_BASE_URL,
  },
  envKey: ORGANIZAONE_ENV_KEY,
  supportsModelDiscovery: true,
  modelNamePrefix: 'OrganizaOne',
  uiGroup: 'organizaone',
  signIn: 'organizaone-device',
  credentialId: 'organizaone',
};

/**
 * The o1-gateway device code: the proxy's pinned tunnel, set up from a
 * connection code and opened inside o1-code at the start of each session
 * (contract §3). The saved `baseUrl` names the proxy; the session talks to
 * the tunnel's loopback endpoint, with a key made for that session.
 */
export const organizaoneO1gwProvider: ProviderConfig = {
  id: 'organizaone-o1gw',
  label: 'o1-gateway device code',
  description: 'Paste an o1-gateway connection code',
  protocol: AuthType.USE_ANTHROPIC,
  protocolOptions: [AuthType.USE_ANTHROPIC, AuthType.USE_OPENAI],
  baseUrlByProtocol: {
    [AuthType.USE_ANTHROPIC]: ORGANIZAONE_ANTHROPIC_BASE_URL,
    [AuthType.USE_OPENAI]: ORGANIZAONE_OPENAI_BASE_URL,
  },
  envKey: '',
  supportsModelDiscovery: true,
  modelNamePrefix: 'OrganizaOne',
  uiGroup: 'organizaone',
  connection: 'o1-connect',
};
