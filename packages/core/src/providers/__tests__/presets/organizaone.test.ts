/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AuthType } from '../../../core/contentGenerator.js';
import {
  isOrganizaOneBaseUrl,
  organizaoneO1gwProvider,
  organizaoneLoginProvider,
  organizaoneProvider,
} from '../../presets/organizaone.js';
import {
  buildInstallPlan,
  resolveBaseUrl,
  shouldShowStep,
} from '../../provider-config.js';

describe('organizaoneProvider', () => {
  it('connects to OrganizaOne with a device token', () => {
    expect(organizaoneProvider).toMatchObject({
      id: 'organizaone',
      label: 'OrganizaOne',
      uiGroup: 'organizaone',
      protocolOptions: [AuthType.USE_ANTHROPIC, AuthType.USE_OPENAI],
      envKey: 'ORGANIZAONE_API_KEY',
      apiKeyPlaceholder: 'device token from the OrganizaOne console',
      supportsModelDiscovery: true,
    });
    expect(organizaoneProvider.comingSoon).toBeUndefined();
  });

  it('asks which protocol to speak to the proxy, never for the host', () => {
    expect(shouldShowStep(organizaoneProvider, 'protocol')).toBe(true);
    expect(shouldShowStep(organizaoneProvider, 'baseUrl')).toBe(false);
    expect(shouldShowStep(organizaoneProvider, 'apiKey')).toBe(true);
  });

  it.each([
    [AuthType.USE_ANTHROPIC, 'https://api.organizago.com'],
    [AuthType.USE_OPENAI, 'https://api.organizago.com/v1'],
  ])('resolves the proxy base URL for %s', (protocol, baseUrl) => {
    expect(resolveBaseUrl(organizaoneProvider, undefined, protocol)).toBe(
      baseUrl,
    );
  });

  it('starts on the Anthropic base URL', () => {
    expect(resolveBaseUrl(organizaoneProvider)).toBe(
      'https://api.organizago.com',
    );
  });

  it.each([
    [AuthType.USE_ANTHROPIC, 'https://api.organizago.com'],
    [AuthType.USE_OPENAI, 'https://api.organizago.com/v1'],
  ])(
    'installs %s on the proxy host whatever URL it is handed',
    (protocol, baseUrl) => {
      const plan = buildInstallPlan(organizaoneProvider, {
        protocol,
        baseUrl: 'https://elsewhere.example',
        apiKey: 'o1-device-token',
        modelIds: ['model-a'],
      });

      expect(plan.credential).toEqual({
        id: 'organizaone',
        apiKey: 'o1-device-token',
      });
      expect(plan.modelProviders?.[0]?.authType).toBe(protocol);
      expect(plan.modelProviders?.[0]?.models[0]).toMatchObject({
        id: 'model-a',
        baseUrl,
        envKey: 'ORGANIZAONE_API_KEY',
        credential: 'organizaone',
      });
    },
  );
});

describe('OrganizaOne sign-in entries', () => {
  it('signs in with the account through device authorization, to the same proxy as the key', () => {
    expect(organizaoneLoginProvider).toMatchObject({
      id: 'organizaone-login',
      label: 'Sign in with your account',
      uiGroup: 'organizaone',
      signIn: 'organizaone-device',
      credentialId: 'organizaone',
      envKey: organizaoneProvider.envKey,
      baseUrlByProtocol: organizaoneProvider.baseUrlByProtocol,
      protocolOptions: organizaoneProvider.protocolOptions,
      supportsModelDiscovery: true,
    });
    expect(organizaoneLoginProvider.comingSoon).toBeUndefined();
    // The token comes from the sign-in, never from a typed key.
    expect(shouldShowStep(organizaoneLoginProvider, 'apiKey')).toBe(false);
    expect(shouldShowStep(organizaoneProvider, 'apiKey')).toBe(true);
  });

  it('saves the sign-in token as the OrganizaOne credential, with its expiry', () => {
    const plan = buildInstallPlan(organizaoneLoginProvider, {
      protocol: AuthType.USE_ANTHROPIC,
      baseUrl: '',
      apiKey: 'o1gw_token',
      credentialExtras: {
        expiresAt: '2027-01-01T12:00:00.000Z',
        deviceName: 'o1-code-on-BOX',
      },
      modelIds: ['claude-sonnet-4-5'],
    });
    expect(plan.credential).toEqual({
      id: 'organizaone',
      apiKey: 'o1gw_token',
      expiresAt: '2027-01-01T12:00:00.000Z',
      deviceName: 'o1-code-on-BOX',
    });
    expect(plan.modelProviders?.[0]?.models[0]).toMatchObject({
      baseUrl: 'https://api.organizago.com',
      envKey: 'ORGANIZAONE_API_KEY',
      credential: 'organizaone',
    });
  });

  it('lists the o1-gateway device code as coming soon', () => {
    expect(organizaoneO1gwProvider).toMatchObject({
      id: 'organizaone-o1gw',
      label: 'o1-gateway device code',
      uiGroup: 'organizaone',
      comingSoon: true,
    });
    expect(() =>
      buildInstallPlan(organizaoneO1gwProvider, {
        baseUrl: 'https://api.organizago.com',
        apiKey: 'x',
        modelIds: ['m'],
      }),
    ).toThrow(/not available yet/);
  });
});

describe('isOrganizaOneBaseUrl', () => {
  it.each([
    'https://api.organizago.com',
    'https://api.organizago.com/v1',
    'https://API.organizago.com/v1',
  ])('recognizes the proxy API at %s', (url) => {
    expect(isOrganizaOneBaseUrl(url)).toBe(true);
  });

  it.each([
    // Deprecated API host.
    'https://models.organizago.com',
    // A host that serves pages, not the API.
    'https://www.organizago.com',
    'https://organizago.com',
    'https://api.organizago.com.evil.example',
    'https://evil.example/api.organizago.com',
    'not a url',
    undefined,
  ])('does not take %s for the proxy API', (url) => {
    expect(isOrganizaOneBaseUrl(url)).toBe(false);
  });
});
