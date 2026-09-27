/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  fakeToolCall,
  startFakeOpenAIServer,
  type FakeOpenAIServer,
} from '../fake-openai-server.js';
import {
  TestRig,
  type,
  applyContainerSandboxNoProxy,
  fakeServerHostOptions,
} from '../test-helper.js';

interface CapturedHookInput {
  hook_event_name?: unknown;
  prompt?: unknown;
  submitted_prompt?: unknown;
}

describe('submitted prompt provenance', () => {
  let fakeServer: FakeOpenAIServer | undefined;
  let rig: TestRig;
  let savedO1CodeHome: string | undefined;
  let savedTrustedFoldersPath: string | undefined;
  let restoreNoProxy: () => void;

  beforeEach(() => {
    rig = new TestRig();
    savedO1CodeHome = process.env['O1CODE_HOME'];
    savedTrustedFoldersPath = process.env['O1CODE_TRUSTED_FOLDERS_PATH'];
    restoreNoProxy = applyContainerSandboxNoProxy();
  });

  afterEach(async () => {
    await fakeServer?.close();
    fakeServer = undefined;
    restoreNoProxy();
    await rig.cleanup();
    if (savedO1CodeHome === undefined) {
      delete process.env['O1CODE_HOME'];
    } else {
      process.env['O1CODE_HOME'] = savedO1CodeHome;
    }
    if (savedTrustedFoldersPath === undefined) {
      delete process.env['O1CODE_TRUSTED_FOLDERS_PATH'];
    } else {
      process.env['O1CODE_TRUSTED_FOLDERS_PATH'] = savedTrustedFoldersPath;
    }
  });

  it('keeps expanded file content out of submitted_prompt and omits it on tool continuation', async () => {
    const submittedPrompt = '@context.txt Inspect this context.';
    const fileCanary = 'EXPANDED_FILE_CANARY_7585';

    await rig.setup('submitted-prompt-provenance', {
      settings: {
        memory: {
          enableManagedAutoMemory: false,
          enableManagedAutoDream: false,
        },
        security: {
          auth: {
            selectedType: 'openai',
          },
        },
      },
    });
    const o1codeHome = join(rig.testDir!, '.o1-code-home');
    const trustedFoldersPath = join(o1codeHome, 'trustedFolders.json');
    rig.mkdir('.o1-code-home');
    rig.createFile(
      '.o1-code-home/settings.json',
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node capture-hook-input.mjs',
                },
              ],
            },
          ],
        },
      }),
    );
    rig.createFile(
      '.o1-code-home/trustedFolders.json',
      JSON.stringify({ [rig.testDir!]: 'TRUST_FOLDER' }),
    );
    process.env['O1CODE_HOME'] = o1codeHome;
    process.env['O1CODE_TRUSTED_FOLDERS_PATH'] = trustedFoldersPath;
    rig.createFile('context.txt', fileCanary);
    const toolFile = rig.createFile('tool-result.txt', 'tool result');
    rig.createFile(
      'capture-hook-input.mjs',
      [
        "import { appendFileSync } from 'node:fs';",
        "let input = '';",
        "process.stdin.setEncoding('utf8');",
        'for await (const chunk of process.stdin) input += chunk;',
        "appendFileSync('hook-inputs.jsonl', `${input.trimEnd()}\\n`);",
        "process.stdout.write('{}');",
      ].join('\n'),
    );

    fakeServer = await startFakeOpenAIServer(
      ({ requestIndex }) =>
        requestIndex === 0
          ? {
              toolCalls: [
                fakeToolCall(
                  'read_file',
                  { file_path: toolFile },
                  'call_submitted_prompt_e2e',
                ),
              ],
            }
          : { content: 'PROVENANCE_E2E_DONE' },
      fakeServerHostOptions(),
    );

    const { ptyProcess, promise } = rig.runInteractive(
      '--auth-type',
      'openai',
      '--openai-api-key',
      'fake-key',
      '--openai-base-url',
      fakeServer.baseUrl,
      '--model',
      'fake-model',
    );

    try {
      const isReady = await rig.waitForText('Type your message', 30_000);
      expect(isReady, 'CLI did not start in interactive mode').toBe(true);

      await type(ptyProcess, submittedPrompt);
      await type(ptyProcess, '\r');

      const completed = await rig.waitForText('PROVENANCE_E2E_DONE', 30_000);
      expect(completed, 'Fake model turn did not complete').toBe(true);

      const capturedBothEvents = await rig.poll(
        () => {
          try {
            return (
              rig
                .readFile('hook-inputs.jsonl')
                .trim()
                .split('\n')
                .filter(Boolean).length >= 2
            );
          } catch {
            return false;
          }
        },
        15_000,
        200,
      );
      expect(capturedBothEvents, 'Expected two hook invocations').toBe(true);

      const inputs = rig
        .readFile('hook-inputs.jsonl')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as CapturedHookInput);

      expect(inputs).toHaveLength(2);
      expect(inputs[0]).toMatchObject({
        hook_event_name: 'UserPromptSubmit',
        submitted_prompt: submittedPrompt,
      });
      expect(inputs[0]?.prompt).toEqual(expect.stringContaining(fileCanary));
      expect(inputs[0]?.submitted_prompt).not.toEqual(
        expect.stringContaining(fileCanary),
      );

      expect(inputs[1]).toMatchObject({
        hook_event_name: 'UserPromptSubmit',
      });
      expect(inputs[1]).not.toHaveProperty('submitted_prompt');
    } finally {
      ptyProcess.kill();
      await promise;
    }
  });
});
