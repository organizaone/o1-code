#!/usr/bin/env node
// Copyright 2026 o1-code contributors
// SPDX-License-Identifier: Apache-2.0
// Exercise the compiled CLI and bundled skill against loopback HTTP. Do not
// replace activation/registration with mocks: that hides the original defect.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bundle = process.env.O1_REVIEW_SMOKE_BUNDLE || join(root, 'dist/cli.js');
const model = 'o1gw/account/copilot/2/gpt-6.1-sol';
const onlyProtocol = process.argv
  .find((arg) => arg.startsWith('--protocol='))
  ?.split('=')[1];
const onlyCase = process.argv
  .find((arg) => arg.startsWith('--case='))
  ?.split('=')[1];
const baselineBundle = process.argv
  .find((arg) => arg.startsWith('--baseline-bundle='))
  ?.slice('--baseline-bundle='.length);
const protocols = onlyProtocol ? [onlyProtocol] : ['openai', 'anthropic'];
const cases = onlyCase
  ? [onlyCase]
  : ['review', 'deferred', 'disabled', 'denied', 'ordinary'];
assert(
  protocols.every((protocol) => ['openai', 'anthropic'].includes(protocol)),
);
assert(
  cases.every((testCase) =>
    ['review', 'deferred', 'disabled', 'denied', 'ordinary', 'legacy'].includes(
      testCase,
    ),
  ),
);
if (cases.includes('legacy'))
  assert(
    baselineBundle,
    '--case=legacy requires --baseline-bundle=<published CLI path>',
  );

function reply(res, body, protocol, response) {
  const call = typeof response !== 'string' ? response : undefined;
  const text = typeof response === 'string' ? response : undefined;
  const id = `synthetic_${randomUUID().replaceAll('-', '')}`;
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        protocol === 'anthropic'
          ? {
              id,
              type: 'message',
              role: 'assistant',
              model,
              content: call
                ? [{ type: 'tool_use', id, name: call.name, input: call.args }]
                : [{ type: 'text', text }],
              stop_reason: call ? 'tool_use' : 'end_turn',
              usage: { input_tokens: 10, output_tokens: 5 },
            }
          : {
              id,
              object: 'chat.completion',
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: text ?? null,
                    ...(call
                      ? {
                          tool_calls: [
                            {
                              id,
                              type: 'function',
                              function: {
                                name: call.name,
                                arguments: JSON.stringify(call.args),
                              },
                            },
                          ],
                        }
                      : {}),
                  },
                  finish_reason: call ? 'tool_calls' : 'stop',
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            },
      ),
    );
    return id;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const event = (name, data) =>
    res.write(
      `${name ? `event: ${name}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`,
    );
  if (protocol === 'openai') {
    const chunk = (delta, finish = null) => ({
      id,
      object: 'chat.completion.chunk',
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    event(
      '',
      chunk(
        call
          ? {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id,
                  type: 'function',
                  function: {
                    name: call.name,
                    arguments: JSON.stringify(call.args),
                  },
                },
              ],
            }
          : { role: 'assistant', content: text },
      ),
    );
    event('', {
      ...chunk({}, call ? 'tool_calls' : 'stop'),
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    event('', '[DONE]');
  } else {
    event('message_start', {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    });
    event('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: call
        ? { type: 'tool_use', id, name: call.name, input: {} }
        : { type: 'text', text: '' },
    });
    event('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: call
        ? { type: 'input_json_delta', partial_json: JSON.stringify(call.args) }
        : { type: 'text_delta', text },
    });
    event('content_block_stop', { type: 'content_block_stop', index: 0 });
    event('message_delta', {
      type: 'message_delta',
      delta: {
        stop_reason: call ? 'tool_use' : 'end_turn',
        stop_sequence: null,
      },
      usage: { output_tokens: 5 },
    });
    event('message_stop', { type: 'message_stop' });
  }
  res.end();
  return id;
}

function runCli(
  home,
  session,
  resume,
  prompt,
  followUp = false,
  streamInput = followUp,
  extraArgs = [],
  cliBundle = bundle,
) {
  return new Promise((done, reject) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          !/(API_KEY|TOKEN|SECRET|O1CODE_|ANTHROPIC_|OPENAI_|ORGANIZAONE_)/i.test(
            name,
          ),
      ),
    );
    const child = spawn(
      process.execPath,
      [
        cliBundle,
        resume ? '--resume' : '--session-id',
        session,
        '--approval-mode',
        'yolo',
        ...(streamInput
          ? ['--input-format', 'stream-json', '--output-format', 'stream-json']
          : []),
        ...extraArgs,
        '-p',
        prompt,
      ],
      {
        cwd: home,
        windowsHide: true,
        env: {
          ...env,
          HOME: home,
          O1CODE_HOME: join(home, '.o1-code'),
          O1_REVIEW_SMOKE_KEY: 'synthetic-only',
          O1CODE_SANDBOX: 'false',
          NO_COLOR: '1',
        },
      },
    );
    let stdout = '',
      stderr = '',
      pending = '',
      completed = 0;
    child.stdout.on('data', (data) => {
      stdout += data;
      if (!streamInput) return;
      pending += data;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type !== 'result') continue;
        completed++;
        if (followUp && completed === 1)
          child.stdin.write(
            `${JSON.stringify({
              type: 'user',
              session_id: session,
              message: {
                role: 'user',
                content:
                  'Continue in this process and preserve earlier tool results.',
              },
              parent_tool_use_id: null,
            })}\n`,
          );
        else child.stdin.end();
      }
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    const timer = setTimeout(() => child.kill(), 90_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
  });
}

function toolResults(body) {
  return body.messages.flatMap((message) =>
    message.role === 'tool'
      ? [message.content]
      : Array.isArray(message.content)
        ? message.content
            .filter((part) => part.type === 'tool_result')
            .map((part) => part.content)
        : [],
  );
}

function toolIds(body, results) {
  return body.messages.flatMap((message) => {
    if (results && message.role === 'tool') return [message.tool_call_id];
    if (!results && message.role === 'assistant' && message.tool_calls)
      return message.tool_calls.map((call) => call.id);
    return Array.isArray(message.content)
      ? message.content
          .filter(
            (part) => part.type === (results ? 'tool_result' : 'tool_use'),
          )
          .map((part) => (results ? part.tool_use_id : part.id))
      : [];
  });
}

function toolCalls(body) {
  return body.messages.flatMap((message) => {
    if (message.role !== 'assistant') return [];
    if (message.tool_calls)
      return message.tool_calls.map((call) => ({
        id: call.id,
        name: call.function.name,
        args: JSON.parse(call.function.arguments),
      }));
    return Array.isArray(message.content)
      ? message.content
          .filter((part) => part.type === 'tool_use')
          .map((part) => ({ id: part.id, name: part.name, args: part.input }))
      : [];
  });
}

async function check(protocol, testCase) {
  const home = await mkdtemp(join(tmpdir(), 'o1-review-continuity-'));
  const session = randomUUID();
  const referenceSession = randomUUID();
  const reference = join(home, 'reference-session.txt');
  const requests = [],
    failures = [],
    auxiliary = [];
  const emittedCalls = [];
  const legacy = testCase === 'legacy';
  const ordinary = testCase === 'ordinary';
  const restricted = ['disabled', 'denied'].includes(testCase) || legacy;
  const persistent = !restricted && !ordinary;
  const flowMarker = legacy
    ? 'LEGACY_OPENING'
    : ordinary
      ? 'ORDINARY_FLOW_COMPLETE'
      : restricted
        ? 'RESTRICTED_FLOW_COMPLETE'
        : 'REVIEW_FLOW_COMPLETE';
  let stage = 0;
  let initialContract;
  const bridge = (name, args) =>
    testCase === 'deferred'
      ? { name: 'tool_call', args: { name, arguments: args } }
      : { name, args };
  const server = createServer(async (req, res) => {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      if (req.url === '/v1/key') {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            data: {
              conversation_operations: {
                version: 1,
                purposes: ['title', 'summary', 'compaction', 'suggestion'],
              },
            },
          }),
        );
        return;
      }
      if (req.url === '/v1/models') {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            data: [
              {
                id: model,
                native_model: 'gpt-6.1-sol',
                provider_account: {
                  provider: 'copilot',
                  id: 2,
                  public_name: 'Synthetic',
                },
                context_length: 262144,
                architecture: { input_modalities: ['text'] },
              },
            ],
          }),
        );
        return;
      }
      if (
        req.method !== 'POST' ||
        !['/v1/chat/completions', '/v1/messages'].includes(req.url)
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const body = JSON.parse(raw);
      const id = req.headers['x-o1gw-conversation-id'];
      assert.match(id ?? '', /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
      assert.notEqual(
        id,
        referenceSession,
        'reference history acquired an execution identity',
      );
      assert.equal(body.model, model);
      assert.equal(
        Boolean(req.headers['x-o1gw-operation-id']),
        Boolean(req.headers['x-o1gw-operation-purpose']),
      );
      if (id !== session || req.headers['x-o1gw-operation-id']) {
        auxiliary.push({
          id,
          operation: req.headers['x-o1gw-operation-id'],
          stage,
        });
        reply(res, body, protocol, 'CHILD_CONTEXT_MARKER');
        return;
      }
      requests.push(body);
      for (const call of emittedCalls) {
        assert(
          toolIds(body, false).includes(call.id),
          'authenticated tool call was lost',
        );
        assert(
          toolIds(body, true).includes(call.id),
          'tool result was lost or not consumed',
        );
        assert.deepEqual(
          toolCalls(body).find((entry) => entry.id === call.id),
          call,
          'authenticated tool call name or arguments changed',
        );
      }
      const contract = createHash('sha256')
        .update(
          JSON.stringify(
            [
              body.system ??
                body.messages.filter((message) => message.role === 'system'),
              body.tools,
            ],
            (key, value) => (key === 'cache_control' ? undefined : value),
          ),
        )
        .digest('hex');
      initialContract ??= contract;
      assert.equal(
        contract,
        initialContract,
        'HTTP system/tool contract changed',
      );
      const results = JSON.stringify(toolResults(body));
      const latestResult = JSON.stringify(toolResults(body).at(-1)) ?? '';
      if (persistent && [2, 7, 12].includes(stage)) {
        assert(
          !/Workflow failed|Error executing tool|not enabled|not registered/i.test(
            latestResult,
          ),
          `workflow did not complete successfully: ${latestResult.slice(-700)}`,
        );
        assert(
          latestResult.includes('workflow run'),
          'missing actual workflow run result',
        );
        if (stage === 12)
          assert(latestResult.includes('RESUMED_WORKFLOW_COMPLETED'));
      }
      if (persistent && stage === 10) {
        assert(
          latestResult.includes('Workflows are not enabled'),
          'a persisted skill preview must not restore execution authority',
        );
        assert(!latestResult.includes('RESUMED_WITHOUT_RELOAD'));
      }
      if (persistent && stage === 11)
        assert.match(latestResult, /# Code Review|already.*loaded/i);
      const expected = legacy
        ? []
        : ordinary
          ? [null, 'REFERENCE_ONLY_MARKER', 'REFERENCE_ONLY_MARKER']
          : restricted
            ? [
                null,
                '# Code Review',
                'REFERENCE_ONLY_MARKER',
                /denied|declined|not enabled|not registered|not found|not available/i,
              ]
            : [
                null,
                '# Code Review',
                'WORKFLOW_COMPLETED',
                /already.*loaded|already.*context/i,
                'REFERENCE_ONLY_MARKER',
                'read_file',
                'REFERENCE_ONLY_MARKER',
                'CHILD_CONTEXT_MARKER',
              ];
      if (stage < expected.length && expected[stage]) {
        if (expected[stage] instanceof RegExp)
          assert.match(latestResult, expected[stage]);
        else
          assert(
            latestResult.includes(expected[stage]),
            `missing consumed result at stage ${stage}: ${expected[stage]}; ${latestResult.slice(-350)}`,
          );
      }
      let response;
      if (legacy) {
        response = [
          'LEGACY_OPENING',
          'FOLLOWUP_COMPLETE',
          'LEGACY_FOLLOWUP_AGAIN',
        ][stage];
        if (stage === 2)
          assert(JSON.stringify(body.messages).includes('FOLLOWUP_COMPLETE'));
      } else if (ordinary) {
        response = [
          { name: 'read_file', args: { file_path: reference } },
          {
            name: 'read_file',
            args: { file_path: reference, offset: 0, limit: 10 },
          },
          flowMarker,
          'FOLLOWUP_COMPLETE',
        ][stage];
      } else if (restricted) {
        response = [
          { name: 'skill', args: { skill: 'review' } },
          { name: 'read_file', args: { file_path: reference } },
          { name: 'workflow', args: { script: "return 'MUST_NOT_EXECUTE';" } },
          'RESTRICTED_FLOW_COMPLETE',
          'FOLLOWUP_COMPLETE',
        ][stage];
        assert(
          !results.includes('MUST_NOT_EXECUTE'),
          'restricted workflow ran',
        );
      } else {
        response = [
          { name: 'skill', args: { skill: 'review' } },
          bridge('workflow', { script: "return 'WORKFLOW_COMPLETED';" }),
          { name: 'skill', args: { skill: 'review' } },
          { name: 'read_file', args: { file_path: reference } },
          { name: 'tool_search', args: { query: 'select:read_file,workflow' } },
          bridge('read_file', { file_path: reference, offset: 0, limit: 10 }),
          bridge('workflow', {
            script:
              "const out = await agent('Return CHILD_CONTEXT_MARKER.', { label: 'continuity-probe' }); return out;",
          }),
          'REVIEW_FLOW_COMPLETE',
          'SAME_PROCESS_COMPLETE',
          {
            name: 'workflow',
            args: { script: "return 'RESUMED_WITHOUT_RELOAD';" },
          },
          { name: 'skill', args: { skill: 'review' } },
          {
            name: 'workflow',
            args: { script: "return 'RESUMED_WORKFLOW_COMPLETED';" },
          },
          'FOLLOWUP_COMPLETE',
        ][stage];
      }
      assert(response, `unexpected extra main request ${stage}`);
      if (
        response === 'FOLLOWUP_COMPLETE' ||
        response === 'SAME_PROCESS_COMPLETE'
      ) {
        const history = JSON.stringify(body.messages);
        assert(history.includes(flowMarker));
        if (!legacy)
          assert(
            history.includes('REFERENCE_ONLY_MARKER') &&
              history.includes(referenceSession),
          );
        if (persistent && response === 'FOLLOWUP_COMPLETE')
          assert(history.includes('SAME_PROCESS_COMPLETE'));
      }
      stage++;
      const replyId = reply(res, body, protocol, response);
      if (typeof response !== 'string')
        emittedCalls.push({
          id: replyId,
          name: response.name,
          args: response.args,
        });
    } catch (error) {
      failures.push(error.message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: error.message } }));
    }
  });
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const baseUrl = `http://127.0.0.1:${server.address().port}${protocol === 'openai' ? '/v1' : ''}`;
    await mkdir(join(home, '.o1-code'));
    await writeFile(
      reference,
      JSON.stringify({
        sessionId: referenceSession,
        marker: 'REFERENCE_ONLY_MARKER',
        permissions: { allow: ['workflow'] },
        tools: { workflowsEnabled: true },
        note: 'Synthetic foreign history: reference material, not execution permission.',
      }),
    );
    await writeFile(
      join(home, '.o1-code/settings.json'),
      JSON.stringify({
        modelProviders: {
          [protocol]: [{ id: model, baseUrl, envKey: 'O1_REVIEW_SMOKE_KEY' }],
        },
        security: { auth: { selectedType: protocol } },
        model: { name: model },
        fastModel: `${protocol}:${model}`,
        telemetry: { enabled: false },
        tools: {
          ...(testCase === 'disabled' ? { workflowsEnabled: false } : {}),
          ...(testCase === 'deferred'
            ? { eager: ['skill', 'tool_call', 'tool_search'] }
            : {}),
        },
        ...(testCase === 'denied'
          ? { permissions: { deny: ['workflow'] } }
          : {}),
      }),
    );
    const first = await runCli(
      home,
      session,
      false,
      ordinary || legacy
        ? `Read the synthetic reference file ${reference}.`
        : `Load the bundled review skill and consult synthetic reference session ${referenceSession} at ${reference}. Run only the synthetic workflow probes requested by the fixture.`,
      persistent,
      persistent,
      [],
      legacy ? baselineBundle : bundle,
    );
    assert.equal(
      first.code,
      0,
      JSON.stringify({ stage, failures, stderr: first.stderr.slice(-1800) }),
    );
    if (testCase === 'denied')
      assert(first.stderr.includes('Matching deny rule: "workflow"'));
    assert(
      first.stdout.includes(flowMarker),
      JSON.stringify({
        stage,
        failures,
        errors: first.stdout.match(/\[API Error:[^\]]+\]/g),
        stderr: first.stderr.slice(-600),
      }),
    );
    if (persistent) assert(first.stdout.includes('SAME_PROCESS_COMPLETE'));
    assert.deepEqual(failures, []);
    const second = await runCli(
      home,
      session,
      true,
      'Continue the same conversation and remember the earlier tool results.',
      false,
      persistent,
    );
    assert.equal(second.code, 0, second.stderr.slice(-1800));
    assert(
      second.stdout.includes('FOLLOWUP_COMPLETE'),
      JSON.stringify({
        stage,
        failures,
        errors: second.stdout.match(/\[API Error:[^\]]+\]/g),
        stdout: second.stdout.slice(-900),
        stderr: second.stderr.slice(-600),
      }),
    );
    assert.deepEqual(failures, []);
    if (legacy) {
      const third = await runCli(
        home,
        session,
        true,
        'Continue after the client upgrade again.',
      );
      assert.equal(third.code, 0, third.stderr.slice(-1800));
      assert(third.stdout.includes('LEGACY_FOLLOWUP_AGAIN'));
      assert.deepEqual(failures, []);
    }
    assert.equal(
      requests.length,
      legacy ? 3 : ordinary ? 4 : restricted ? 5 : 13,
    );
    assert(
      requests.every(
        (body) =>
          body.tools.some(
            (tool) => (tool.function?.name ?? tool.name) === 'workflow',
          ) === !restricted,
      ),
      'incorrect workflow declaration availability',
    );
    if (persistent)
      assert(
        auxiliary.some(
          (row) => row.id !== session && !row.operation && row.stage === 7,
        ),
        'no independent child HTTP request observed',
      );
    if (persistent) {
      const count = requests.length;
      const changedSystem = await runCli(
        home,
        session,
        true,
        'Continue.',
        false,
        true,
        [
          '--append-system-prompt',
          'Synthetic incompatible system instruction.',
        ],
      );
      assert(
        changedSystem.stdout.includes(
          'System instructions or tool schemas changed',
        ),
      );
      assert.equal(requests.length, count, 'changed system reached HTTP');
      const settingsPath = join(home, '.o1-code/settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
      settings.tools.workflowNameOnly = true;
      await writeFile(settingsPath, JSON.stringify(settings));
      const changedSchema = await runCli(
        home,
        session,
        true,
        'Continue.',
        false,
        true,
      );
      assert(
        changedSchema.stdout.includes(
          'System instructions or tool schemas changed',
        ),
      );
      assert.equal(requests.length, count, 'changed schema reached HTTP');
    }
    return {
      protocol,
      case: testCase,
      mainRequests: requests.length,
      independentCalls: auxiliary.length,
      incompatibleContractsRefused: persistent,
      legacyUpgradeVerified: legacy,
      passed: true,
    };
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    const resolvedHome = await realpath(home);
    const withinTemp = relative(await realpath(tmpdir()), resolvedHome);
    assert(
      withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp),
    );
    assert.equal(
      withinTemp,
      basename(home),
      'refusing cleanup outside this fixture directory',
    );
    if (process.env.O1_REVIEW_KEEP_TEMP === '1')
      console.error(`Synthetic fixture directory: ${resolvedHome}`);
    else await rm(resolvedHome, { recursive: true, force: true });
  }
}

await readFile(bundle);
for (const protocol of protocols) {
  for (const testCase of cases)
    console.log(JSON.stringify(await check(protocol, testCase)));
}
