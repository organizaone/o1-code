/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 *
 * Run after bundling: npx tsx integration-tests/terminal-capture/subagent-dashboard-regression.ts
 * Exercises the real CLI with an isolated home and a deterministic local provider.
 * Screenshots and raw terminal evidence default to ignored ops/subagent-dashboard.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import xtermHeadless from '@xterm/headless';
import {
  TerminalCapture,
  type TerminalCaptureOptions,
} from './terminal-capture.js';
import {
  fakeToolCall,
  startFakeOpenAIServer,
  type FakeOpenAIServerOptions,
} from '../fake-openai-server.js';

type DashboardCapture = Pick<
  TerminalCapture,
  | 'spawn'
  | 'type'
  | 'resize'
  | 'getScreenText'
  | 'getRawOutput'
  | 'capture'
  | 'close'
>;
export interface DashboardRegressionOptions {
  createCapture?: (
    options: TerminalCaptureOptions,
  ) => Promise<DashboardCapture>;
  serverOptions?: FakeOpenAIServerOptions;
  outputDir?: string;
}
export async function runSubagentDashboardRegression(
  options: DashboardRegressionOptions = {},
) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  const output = path.resolve(
    options.outputDir ?? 'ops/subagent-dashboard/terminal',
  );
  mkdirSync(output, { recursive: true });
  const home = mkdtempSync(path.join(os.tmpdir(), 'o1-agent-dashboard-'));
  const configHome = path.join(home, '.o1-code');
  mkdirSync(configHome);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const turns = new Map<string, number>();
  let mainTurns = 0;
  const server = await startFakeOpenAIServer(async ({ body }) => {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const roleText = messages
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null &&
          typeof item === 'object' &&
          'role' in item &&
          (item.role === 'system' || item.role === 'user'),
      )
      .map((item) => JSON.stringify(item.content))
      .join('\n');
    const marker = ['A', 'B'].find((id) =>
      roleText.includes('DASHBOARD_CHILD_' + id),
    );
    if (marker) {
      const turn = (turns.get(marker) ?? 0) + 1;
      turns.set(marker, turn);
      if (turn === 1)
        return {
          toolCalls: [
            fakeToolCall(
              'report_progress',
              {
                todos: [
                  {
                    id: 'inspect',
                    content: 'Inspect source ' + marker,
                    status: 'completed',
                  },
                  {
                    id: 'verify',
                    content: 'Verify scenario ' + marker,
                    status: 'in_progress',
                  },
                  {
                    id: 'report',
                    content: 'Deliver report ' + marker,
                    status: 'pending',
                    blockedBy: ['verify'],
                  },
                ],
              },
              'progress_' + marker,
            ),
          ],
        };
      await held;
      return { content: 'DASHBOARD_CHILD_DONE_' + marker };
    }
    mainTurns++;
    if (mainTurns === 1)
      return {
        toolCalls: ['A', 'B'].map((id) =>
          fakeToolCall(
            'agent',
            {
              description: 'Dashboard agent ' + id,
              prompt:
                'DASHBOARD_CHILD_' +
                id +
                ': Publish your explicit three-step progress with report_progress, then await the provider response.',
              subagent_type: 'general-purpose',
              run_in_background: true,
            },
            'launch_' + id,
          ),
        ),
      };
    return { content: 'DASHBOARD_READY' };
  }, options.serverOptions);
  const settings = {
    modelProviders: {
      dashboard: [
        {
          id: 'dashboard-model',
          envKey: 'O1_DASHBOARD_KEY',
          baseUrl: server.baseUrl,
        },
      ],
    },
    providerProtocol: { dashboard: 'openai' },
    security: { auth: { selectedType: 'openai' } },
    model: { name: 'dashboard-model' },
    general: { preventSystemSleep: false, enableAutoUpdate: false },
    telemetry: { enabled: false },
    privacy: { usageStatisticsEnabled: false },
    ui: {
      theme: 'O1-Code Dark',
      logoAnimation: 'off',
      enableUserFeedback: false,
      useTerminalBuffer: true,
    },
  };
  writeFileSync(
    path.join(configHome, 'settings.json'),
    JSON.stringify(settings),
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    O1CODE_HOME: configHome,
    O1_DASHBOARD_KEY: 'dummy',
    O1CODE_LANG: 'en',
    O1CODE_NO_RELAUNCH: '1',
    O1CODE_SANDBOX: 'false',
    FORCE_COLOR: '3',
    TERM: 'xterm-256color',
    NODE_NO_WARNINGS: '1',
  };
  for (const key of Object.keys(env)) if (/proxy/i.test(key)) delete env[key];
  delete env.NO_COLOR;
  const terminal = await (options.createCapture ?? TerminalCapture.create)({
    cols: 120,
    rows: 40,
    cwd: root,
    outputDir: output,
    env,
    title: 'Subagent dashboard regression',
    chrome: false,
    theme: 'github-dark',
  });
  const decoded = new xtermHeadless.Terminal({
    cols: 120,
    rows: 40,
    allowProposedApi: true,
  });
  let consumed = 0;
  const pause = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const sync = async () => {
    const raw = terminal.getRawOutput();
    await new Promise<void>((resolve) =>
      decoded.write(raw.slice(consumed), resolve),
    );
    consumed = raw.length;
  };
  const screen = async () => {
    await terminal.getScreenText();
    await sync();
    return terminal.getScreenText();
  };
  const waitFor = async (text: string, timeout = 20_000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if ((await screen()).includes(text)) return;
      await pause(100);
    }
    throw new Error('Missing screen marker: ' + text + '\n' + (await screen()));
  };
  const send = async (text: string) => {
    await terminal.type(text, { delay: 100 });
    await pause(150);
    await sync();
  };
  const save = async (name: string) => {
    writeFileSync(path.join(output, name + '.txt'), await screen());
    await terminal.capture(name + '.png');
    writeFileSync(path.join(output, 'session.ansi'), terminal.getRawOutput());
  };
  const bufferLines = () =>
    Array.from(
      { length: decoded.rows },
      (_, index) =>
        decoded.buffer.active.getLine(index)?.translateToString(true) ?? '',
    );
  const inspectFrameEdges = () => {
    const lines = bufferLines();
    let bottom = lines.length - 1;
    while (bottom >= 0 && !/[╰└]/u.test(lines[bottom]!)) bottom--;
    assert.ok(bottom >= 0, 'The dashboard lower border must be visible');
    let top = bottom - 1;
    while (top >= 0 && !/[╭┌]/u.test(lines[top]!)) top--;
    assert.ok(top >= 0, 'The dashboard upper border must be visible');
    const margin = decoded.cols < 80 ? 1 : 2;
    const right = decoded.cols - margin - 1;
    for (let row = top; row <= bottom; row++) {
      const edge = decoded.buffer.active
        .getLine(row)!
        .getCell(right)!
        .getChars();
      assert.match(
        edge,
        /[╮┐│╯┘]/u,
        'A dashboard border was clipped or wrapped at row ' + row,
      );
    }
  };
  const inspectTabStyle = () => {
    const lines = bufferLines();
    const index = lines.findIndex(
      (text) => text.includes('Summary') && text.includes('Details'),
    );
    assert.ok(index >= 0, 'Detail tabs must be visible');
    const row = decoded.buffer.active.getLine(index)!;
    const text = lines[index]!;
    const summary = row.getCell(text.indexOf('Summary'))!;
    const plan = row.getCell(text.indexOf('Plan'))!;
    assert.notEqual(
      summary.getBgColor(),
      plan.getBgColor(),
      'Selected tab must have a filled background',
    );
    const start = text.indexOf('Summary') - 1;
    assert.ok(
      !lines[index + 1]!.slice(start).replace(/[│\s]/gu, ''),
      'A blank row must separate tabs and content',
    );
    return index;
  };
  try {
    await terminal.spawn(process.execPath, ['dist/cli.js', '-y']);
    await waitFor('Type your message', 30_000);
    await send('RUN_DASHBOARD_VALIDATION');
    await send('\r');
    const readyBy = Date.now() + 30_000;
    while ((turns.get('A') ?? 0) < 2 || (turns.get('B') ?? 0) < 2) {
      assert.ok(Date.now() < readyBy, 'Both real agents must publish progress');
      await pause(100);
    }
    await waitFor('DASHBOARD_READY');
    await send('/tasks');
    await send('\r');
    await waitFor('Declared plan');
    assert.ok(
      (await screen()).includes('1/3'),
      'The plan must come from the real report_progress tool',
    );
    inspectTabStyle();
    inspectFrameEdges();
    const countRow = bufferLines().findIndex((text) =>
      text.includes('2 tasks'),
    );
    assert.ok(
      countRow > 0 && /[╰└]/u.test(bufferLines()[countRow + 1]!),
      'Roster count must be pinned above the bottom border',
    );
    await save('wide-summary');
    await send('\u001b[C');
    await waitFor('About progress');
    await send('\u001b[B');
    assert.equal(
      bufferLines().findIndex((text) => text.includes('2 tasks')),
      countRow,
      'Roster count must not move',
    );
    assert.ok(
      (await screen()).includes('Declared plan'),
      'Changing tabs must not capture roster navigation',
    );
    await send('\r');
    await waitFor('esc back to list');
    const hints = bufferLines().findIndex((text) =>
      text.includes('esc back to list'),
    );
    const hintText = bufferLines()[hints]!;
    const hintRow = decoded.buffer.active.getLine(hints)!;
    assert.equal(
      hintRow.getCell(hintText.indexOf('←→ tabs'))!.getFgColor(),
      hintRow.getCell(hintText.indexOf('esc back'))!.getFgColor(),
      'Primary detail controls must share their accent color',
    );
    await save('wide-plan');
    await send('\u001b');
    assert.ok(
      (await screen()).includes('enter view'),
      'Escape must return to the agent list',
    );
    await sync();
    decoded.resize(70, 24);
    await terminal.resize(70, 24);
    await pause(400);
    await sync();
    await save('compact-list');
    inspectFrameEdges();
    assert.ok(
      !(await screen()).includes('Declared plan'),
      'A narrow terminal must show the roster first',
    );
    await send('\r');
    await waitFor('Declared plan');
    await save('compact-plan');
    inspectFrameEdges();
    await send('\u001b[C');
    await send('\u001b[C');
    for (
      let page = 0;
      page < 20 && !(await screen()).includes('Transcript');
      page++
    ) {
      await send('\u001b[6~');
    }
    await waitFor('Transcript');
    await save('compact-details');
    await send('\u001b');
    await sync();
    decoded.resize(120, 40);
    await terminal.resize(120, 40);
    await pause(400);
    await sync();
    await save('restored-wide');
    inspectFrameEdges();
    writeFileSync(
      path.join(output, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          provider: 'local deterministic fixture',
          turns: Object.fromEntries(turns),
          dimensions: [
            [120, 40],
            [70, 24],
          ],
          assertions: [
            'real progress tool',
            'filled active tab',
            'blank row',
            'list focus preserved',
            'pinned count',
            'matching shortcut colors',
            'Escape returns to list',
            'resize',
          ],
        },
        null,
        2,
      ),
    );
    console.log('PASS subagent dashboard regression: ' + output);
  } catch (error) {
    await save('failure').catch(() => {});
    throw error;
  } finally {
    release();
    decoded.dispose();
    await terminal.close();
    await server.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runSubagentDashboardRegression().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
