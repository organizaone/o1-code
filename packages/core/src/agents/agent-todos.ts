/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TodoItem } from '../hooks/types.js';

export function normalizeAgentTodoItems(
  value: unknown,
): TodoItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: TodoItem[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (item === null || typeof item !== 'object') return undefined;
    const todo = item as Record<string, unknown>;
    const { id, content, status, blockedBy } = todo;
    if (
      typeof id !== 'string' ||
      !id ||
      ids.has(id) ||
      typeof content !== 'string' ||
      !content.trim() ||
      (status !== 'pending' &&
        status !== 'in_progress' &&
        status !== 'completed') ||
      (blockedBy !== undefined &&
        (!Array.isArray(blockedBy) ||
          !blockedBy.every((entry) => typeof entry === 'string')))
    )
      return undefined;
    ids.add(id);
    result.push({
      id,
      content,
      status,
      ...(blockedBy !== undefined
        ? { blockedBy: [...blockedBy] as string[] }
        : {}),
    });
  }
  return result;
}
