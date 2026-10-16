/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { normalizeAgentTodoItems } from './agent-todos.js';

describe('normalizeAgentTodoItems', () => {
  it('preserves an empty persisted plan and clones valid items and dependencies', () => {
    expect(normalizeAgentTodoItems([])).toEqual([]);
    const items = [
      { id: 'a', content: 'Inspect', status: 'completed' },
      { id: 'b', content: 'Implement', status: 'pending', blockedBy: ['a'] },
    ];
    const result = normalizeAgentTodoItems(items);
    expect(result).toEqual(items);
    expect(result?.[1]).not.toBe(items[1]);
    expect(result?.[1]?.blockedBy).not.toBe(items[1]?.blockedBy);
  });

  it.each([
    undefined,
    {},
    [null],
    [{ id: 'a', content: 'Inspect', status: 'cancelled' }],
    [{ id: 'a', content: 'Inspect', status: 'pending', blockedBy: [1] }],
    [{ id: 'a', content: '', status: 'pending' }],
    [
      { id: 'a', content: 'Inspect', status: 'pending' },
      { id: 'a', content: 'Duplicate', status: 'pending' },
    ],
  ])(
    'rejects malformed persisted plan %j without partial recovery',
    (value) => {
      expect(normalizeAgentTodoItems(value)).toBeUndefined();
    },
  );
});
