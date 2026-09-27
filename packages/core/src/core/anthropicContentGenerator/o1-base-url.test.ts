/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { anthropicSdkBaseUrl } from './o1-base-url.js';

describe('anthropicSdkBaseUrl', () => {
  it('drops a trailing /v1, which the SDK appends itself', () => {
    expect(anthropicSdkBaseUrl('https://api.anthropic.com/v1')).toBe(
      'https://api.anthropic.com',
    );
    expect(anthropicSdkBaseUrl('https://gateway.example/anthropic/v1/')).toBe(
      'https://gateway.example/anthropic',
    );
  });

  it('keeps a base URL without a trailing /v1', () => {
    expect(anthropicSdkBaseUrl('https://api.anthropic.com')).toBe(
      'https://api.anthropic.com',
    );
    expect(anthropicSdkBaseUrl('https://gateway.example/v1beta')).toBe(
      'https://gateway.example/v1beta',
    );
    expect(anthropicSdkBaseUrl('https://gateway.example/v1/proxy')).toBe(
      'https://gateway.example/v1/proxy',
    );
  });

  it('leaves an absent base URL absent so the SDK can read ANTHROPIC_BASE_URL', () => {
    expect(anthropicSdkBaseUrl(undefined)).toBeUndefined();
  });
});
