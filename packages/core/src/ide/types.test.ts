/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { IdeContextNotificationSchema } from './types.js';

describe('IDE context notifications', () => {
  it('rejects an oversized list of open files before validating every entry', () => {
    const result = IdeContextNotificationSchema.safeParse({
      jsonrpc: '2.0',
      method: 'ide/contextUpdate',
      params: { workspaceState: { openFiles: Array(10_001).fill({}) } },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(1);
  });
});
