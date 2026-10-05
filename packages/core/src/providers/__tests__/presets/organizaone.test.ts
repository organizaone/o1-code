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
  it.each([
    [
      organizaoneLoginProvider,
      'organizaone-login',
      'Sign in with your account',
    ],
    [organizaoneO1gwProvider, 'organizaone-o1gw', 'o1-gateway device code'],
  ])('lists %s as coming soon', (provider, id, label) => {
    expect(provider).toMatchObject({
      id,
      label,
      uiGroup: 'organizaone',
      comingSoon: true,
    });
  });

  it.each([organizaoneLoginProvider, organizaoneO1gwProvider])(
    'refuses to build an install plan for $id',
    (provider) => {
      expect(() =>
        buildInstallPlan(provider, {
          baseUrl: 'https://api.organizago.com',
          apiKey: 'x',
          modelIds: ['m'],
        }),
      ).toThrow(/not available yet/);
    },
  );
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
