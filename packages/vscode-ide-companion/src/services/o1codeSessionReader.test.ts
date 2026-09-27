/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvBootstrapForTesting } from '../utils/paths.js';
import { O1CodeSessionReader } from './o1codeSessionReader.js';

const originalRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
let runtimeDir: string;

beforeEach(() => {
  runtimeDir = mkdtempSync(join(tmpdir(), 'o1-code-session-reader-'));
  process.env['O1CODE_RUNTIME_DIR'] = runtimeDir;
  resetEnvBootstrapForTesting();
});

afterEach(() => {
  if (originalRuntimeDir !== undefined) {
    process.env['O1CODE_RUNTIME_DIR'] = originalRuntimeDir;
  } else {
    delete process.env['O1CODE_RUNTIME_DIR'];
  }
  resetEnvBootstrapForTesting();
  rmSync(runtimeDir, { recursive: true, force: true });
});

describe('O1CodeSessionReader', () => {
  it('projects UserPromptSubmit provenance in summaries and hydrated messages', async () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const chatsDir = join(runtimeDir, 'tmp', 'project-hash', 'chats');
    mkdirSync(chatsDir, { recursive: true });
    const taggedContext =
      '<o1-code:user-prompt-submit-context>\nhook-only context\n</o1-code:user-prompt-submit-context>';
    writeFileSync(
      join(chatsDir, `${sessionId}.jsonl`),
      `${JSON.stringify({
        sessionId,
        uuid: 'user-1',
        timestamp: '2026-03-22T16:48:35.000Z',
        type: 'user',
        message: {
          role: 'user',
          parts: [{ text: 'expanded model prompt' }, { text: taggedContext }],
        },
        systemPayload: {
          displayText: 'raw @file prompt',
          hookContext: 'hook-only context',
        },
      })}\n`,
    );

    const reader = new O1CodeSessionReader();
    const summaries = await reader.getAllSessions(undefined, true);
    const hydrated = await reader.getSession(sessionId);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.firstUserText).toBe('raw @file prompt');
    expect(hydrated?.messages).toMatchObject([
      { type: 'user', content: 'raw @file prompt' },
    ]);
    expect(hydrated?.messages[0]?.content).not.toContain('hook-only context');
  });
});
