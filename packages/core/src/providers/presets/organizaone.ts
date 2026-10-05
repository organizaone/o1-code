/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../../core/contentGenerator.js';
import { BRAND } from '../../generated/brand.js';
import type { ProviderConfig } from '../types.js';

/** The proxy host is a constant of the preset; another host is a Custom provider. */
export const ORGANIZAONE_ANTHROPIC_BASE_URL = 'https://api.organizago.com';
export const ORGANIZAONE_OPENAI_BASE_URL = 'https://api.organizago.com/v1';
export const ORGANIZAONE_ENV_KEY = 'ORGANIZAONE_API_KEY';

/**
 * The proxy's API host. `models.` is deprecated, and the hosts that serve the
 * console's pages are not the API: neither is the proxy for o1-code.
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
 * Listed in the OrganizaOne menu as "coming soon" until the proxy serves the
 * device-authorization contract; not installable.
 */
export const organizaoneLoginProvider: ProviderConfig = {
  id: 'organizaone-login',
  label: 'Sign in with your account',
  description: 'Sign in to OrganizaOne in the browser',
  protocol: AuthType.USE_ANTHROPIC,
  envKey: '',
  modelNamePrefix: 'OrganizaOne',
  uiGroup: 'organizaone',
  comingSoon: true,
};

export const organizaoneO1gwProvider: ProviderConfig = {
  id: 'organizaone-o1gw',
  label: 'o1-gateway device code',
  description: 'Paste an o1-gateway connection code',
  protocol: AuthType.USE_ANTHROPIC,
  envKey: '',
  modelNamePrefix: 'OrganizaOne',
  uiGroup: 'organizaone',
  comingSoon: true,
};
