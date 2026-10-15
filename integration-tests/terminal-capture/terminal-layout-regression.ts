/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Run after build/bundle with either feedback or question as the scenario argument.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeOpenAIServer, fakeToolCall } from '../fake-openai-server.js';
import { TerminalCapture } from './terminal-capture.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scenario = process.argv[2] ?? 'feedback';
assert.ok(
  ['feedback', 'question'].includes(scenario),
  'scenario must be feedback or question',
);
const output =
  process.env['O1CODE_TUI_E2E_OUT'] ??
  mkdtempSync(join(tmpdir(), 'o1-feedback-captures-'));
mkdirSync(output, { recursive: true });
const home = mkdtempSync(join(tmpdir(), 'o1-feedback-layout-'));
const stateDirectory = join(home, '.o1-code');
mkdirSync(stateDirectory);
const preload = join(home, 'feedback-random.mjs');
writeFileSync(
  preload,
  '// Copyright 2026 o1-code contributors\nMath.random = () => 0.1;\n',
);
let releaseQuestion: () => void = () => {};
const questionReady = new Promise<void>((resolve) => {
  releaseQuestion = resolve;
});
const server = await startFakeOpenAIServer(async ({ body }) => {
  const messages = body['messages'];
  const lastUser = Array.isArray(messages)
    ? [...messages]
        .reverse()
        .find((message: { role?: string }) => message.role === 'user')
    : undefined;
  const seed =
    JSON.stringify(lastUser)?.match(/LAYOUT_SEED_(\d+)/)?.[1] ?? 'startup';
  if (JSON.stringify(lastUser)?.includes('OPEN_QUESTION')) {
    await questionReady;
    return {
      toolCalls: [
        fakeToolCall('ask_user_question', {
          questions: [
            {
              header: 'Layout',
              question: Array.from(
                { length: 35 },
                (_, row) => `Question row ${row + 1}`,
              ).join('\n'),
              options: [
                { label: 'FIRST_CHOICE', description: 'First description' },
                { label: 'LAST_CHOICE', description: 'Last description' },
              ],
            },
          ],
        }),
      ],
      finishReason: 'tool_calls',
    };
  }
  return {
    content:
      Array.from(
        { length: 24 },
        (_, row) =>
          `History ${seed}.${row + 1}: review the diagnostic output with accents ação, revisão and /workspace/example/component/source-file.ts.`,
      ).join('\n') + `\nLAYOUT_DONE_${seed}`,
  };
});
writeFileSync(
  join(stateDirectory, 'settings.json'),
  JSON.stringify({
    modelProviders: {
      'local-layout': [
        {
          id: 'layout-model',
          envKey: 'O1_LAYOUT_KEY',
          baseUrl: server.baseUrl,
        },
      ],
    },
    providerProtocol: { 'local-layout': 'openai' },
    security: { auth: { selectedType: 'openai' } },
    model: { name: 'layout-model' },
    general: { preventSystemSleep: false, enableAutoUpdate: false },
    privacy: { usageStatisticsEnabled: scenario === 'feedback' },
    telemetry: { enabled: false },
    ui: {
      theme: 'O1-Code Dark',
      logoAnimation: 'off',
      enableUserFeedback: scenario === 'feedback',
      useTerminalBuffer: true,
      glyphs: 'full',
    },
  }),
);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  HOME: home,
  O1CODE_HOME: stateDirectory,
  O1_LAYOUT_KEY: 'sk-local-layout',
  O1CODE_NO_RELAUNCH: 'true',
  O1CODE_SANDBOX: 'false',
  O1CODE_SUPPRESS_YOLO_WARNING: '1',
  FORCE_COLOR: '1',
  TERM: 'xterm-256color',
  NODE_NO_WARNINGS: '1',
  O1CODE_LANG: 'en',
};
delete env['NO_COLOR'];
const terminal = await TerminalCapture.create({
  cols: 100,
  rows: 30,
  fontSize: 14,
  cwd: home,
  env,
  chrome: false,
  outputDir: output,
});

async function waitForVisible(text: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const frame = await terminal.getScreenText();
    if (frame.includes(text)) return frame;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Visible frame did not contain ${text}`);
}

try {
  await terminal.spawn(process.execPath, [
    '--import',
    preload,
    join(repo, 'dist/cli.js'),
    '-y',
  ]);
  await waitForVisible('Type your message');
  for (let turn = 0; turn < 6; turn++) {
    await terminal.type(`LAYOUT_SEED_${turn}`, { slow: true, delay: 35 });
    await terminal.type('\r');
    await waitForVisible(`LAYOUT_DONE_${turn}`);
    await terminal.idle(500, 5000);
  }
  if (scenario === 'question') {
    await terminal.type('OPEN_QUESTION', { slow: true, delay: 35 });
    await terminal.type('\r');
    await terminal.waitFor('OPEN_QUESTION', { timeout: 5000 });
    for (let page = 0; page < 3; page++)
      await terminal.type('\u001b[5~', { delay: 200 });
    await terminal.idle(300, 2000);
    const earlierFrame = await terminal.getScreenText();
    assert.ok(
      !earlierFrame.includes('LAYOUT_DONE_5'),
      'fixture must scroll away from the latest turn',
    );
    releaseQuestion();
    await waitForVisible('FIRST_CHOICE');
    const seen = new Set<string>();
    async function checkQuestion(label: string) {
      await terminal.idle(500, 3000);
      const frame = await terminal.getScreenText();
      await terminal.capture(`${label}.png`);
      writeFileSync(join(output, `${label}.txt`), frame);
      assert.ok(frame.includes('ORGANIZAONE'), 'question must preserve header');
      assert.ok(
        frame.includes('FIRST_CHOICE'),
        'question must keep the active choice visible',
      );
      assert.ok(
        frame.includes('Navigate'),
        'question must keep controls visible',
      );
      for (const row of frame.match(/Question row \d+/g) ?? []) seen.add(row);
      return frame;
    }
    await checkQuestion('question-open');
    for (let page = 0; page < 8; page++) {
      await terminal.type('\u001b[6~', { delay: 150 });
      await checkQuestion(`question-down-${page}`);
    }
    for (let row = 1; row <= 35; row++)
      assert.ok(
        seen.has(`Question row ${row}`),
        `question row ${row} must remain accessible`,
      );
    await terminal.type('\u001b[5~', { delay: 150 });
    const beforeWheel = await checkQuestion('question-back-up');
    await terminal.type('\u001b[<64;10;15M', { delay: 150 });
    const afterWheel = await checkQuestion('question-wheel-up');
    assert.notEqual(
      afterWheel.match(/Question row \d+/)?.[0],
      beforeWheel.match(/Question row \d+/)?.[0],
      'mouse wheel must scroll question content',
    );
    await terminal.type('\u001b[<65;10;15M', { delay: 150 });
    await checkQuestion('question-wheel-down');
    await terminal.type('\u000f', { delay: 200 });
    await checkQuestion('question-full-detail');
    console.log(`Question layout regression passed; captures: ${output}`);
  } else {
    const openFrame = await waitForVisible(
      'How is O1-Code doing this session?',
    );
    await terminal.capture('feedback-open.png');
    writeFileSync(join(output, 'feedback-open.txt'), openFrame);
    assert.ok(
      openFrame.includes('ORGANIZAONE'),
      'feedback must preserve the pinned header',
    );
    assert.ok(
      openFrame.includes('LAYOUT_DONE_5'),
      'feedback must preserve the latest response',
    );
    assert.ok(
      openFrame.includes('Type your message'),
      'feedback must preserve the input',
    );
    assert.ok(
      openFrame.includes('Dismiss'),
      'feedback actions must stay visible',
    );

    await terminal.type('x', { delay: 200 });
    await terminal.idle(500, 5000);
    const closedFrame = await terminal.getScreenText();
    await terminal.capture('feedback-dismissed.png');
    writeFileSync(join(output, 'feedback-dismissed.txt'), closedFrame);
    assert.ok(
      !closedFrame.includes('How is O1-Code doing this session?'),
      'typing must dismiss feedback',
    );
    assert.ok(
      closedFrame.includes('ORGANIZAONE'),
      'closing feedback must preserve the header',
    );
    assert.ok(
      closedFrame.includes('LAYOUT_DONE_5'),
      'closing feedback must preserve history',
    );
    assert.ok(
      closedFrame.includes('❯ x'),
      'dismissal must keep the typed character',
    );
    console.log(`Feedback layout regression passed; captures: ${output}`);
  }
} catch (error) {
  writeFileSync(join(output, 'failure.txt'), await terminal.getScreenText());
  await terminal.capture('failure.png');
  throw error;
} finally {
  releaseQuestion();
  writeFileSync(join(output, `${scenario}.ansi`), terminal.getRawOutput());
  await terminal.close();
  await server.close();
  rmSync(home, { recursive: true, force: true });
}
