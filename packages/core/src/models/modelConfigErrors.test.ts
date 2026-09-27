/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { MissingApiKeyError } from './modelConfigErrors.js';

describe('MissingApiKeyError', () => {
  it('points at /auth and the variable, not at a settings key', () => {
    const error = new MissingApiKeyError({
      authType: 'openai',
      model: 'gpt-5',
      baseUrl: undefined,
      envKey: 'OPENAI_API_KEY',
    });

    expect(error.message).toContain('Connect a provider with /auth');
    expect(error.message).toContain("'OPENAI_API_KEY'");
    expect(error.message).not.toContain('security.auth');
  });
});
