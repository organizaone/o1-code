/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@google/genai');
  vi.resetModules();
});

it('handles tool intent schemas without loading the provider SDK', async () => {
  vi.resetModules();
  vi.doMock('@google/genai', () => {
    throw new Error('Provider SDK must remain lazy during ACP bootstrap');
  });
  const { withIntentParam, extractIntent } = await import('./intent-param.js');
  expect(withIntentParam({ name: 'tool' }).parametersJsonSchema).toMatchObject({
    properties: { intent: { type: 'string' } },
  });
  expect(extractIntent({ intent: 'Read file', path: 'file.ts' })).toEqual({
    intent: 'Read file',
    args: { path: 'file.ts' },
  });
});
