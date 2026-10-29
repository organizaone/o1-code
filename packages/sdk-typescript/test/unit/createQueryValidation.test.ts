/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { query, type QueryOptions } from '../../src/query/createQuery.js';

describe('query option validation', () => {
  it('reports each invalid option with its field path before starting a process', () => {
    const options = { cwd: 42, model: 123 } as unknown as QueryOptions;
    expect(() => query({ prompt: 'hello', options })).toThrow(
      /^Invalid QueryOptions:.*cwd:.*model:/,
    );
  });

  it('reports the reserved argument that would conflict with managed CLI options', () => {
    expect(() =>
      query({ prompt: 'hello', options: { extraArgs: ['--model=example'] } }),
    ).toThrow(
      'Invalid QueryOptions: extraArgs: extraArgs cannot contain reserved flag: --model=example',
    );
  });
});
