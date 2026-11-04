#!/usr/bin/env node
// Provider smoke test: the bundle answers a headless prompt through a provider
// configured by URL, in both protocols the fork treats as first class —
// OpenAI-compatible and Anthropic.
//
// Each provider is a local server that speaks just enough of the protocol for
// one streamed reply. The CLI runs against dist/cli.js with a throwaway home
// holding a settings.json that declares a *custom* provider id, maps it to the
// protocol with `providerProtocol`, and points it at the local server by
// `baseUrl` — the configuration a user of a self-hosted or third-party gateway
// writes. No network access and no real credential are involved.
//
// A run passes when the reply reaches stdout and the server saw the request the
// configuration describes: the configured model, the configured key, the path
// of the protocol. The Anthropic provider runs twice, with and without a
// trailing /v1 on its base URL: the fork accepts both forms.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bundle = join(root, 'dist', 'cli.js');
const TIMEOUT_MS = 90_000;

function sse(res, events) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  for (const [event, data] of events) {
    if (event) res.write(`event: ${event}\n`);
    res.write(
      `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`,
    );
  }
  res.end();
}

function openaiReply(res, body, text) {
  const model = body.model ?? 'unknown';
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-smoke',
        object: 'chat.completion',
        created: 0,
        model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    return;
  }
  const chunk = (delta, finish) => ({
    id: 'chatcmpl-smoke',
    object: 'chat.completion.chunk',
    created: 0,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  sse(res, [
    [null, chunk({ role: 'assistant', content: text }, null)],
    [
      null,
      {
        ...chunk({}, 'stop'),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ],
    [null, '[DONE]'],
  ]);
}

function anthropicReply(res, body, text) {
  const model = body.model ?? 'unknown';
  const usage = { input_tokens: 1, output_tokens: 1 };
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'msg_smoke',
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage,
      }),
    );
    return;
  }
  sse(res, [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_smoke',
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
    ],
    [
      'content_block_start',
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
    ],
    [
      'content_block_delta',
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text },
      },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 1 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ]);
}

function gatewayToolReply(protocol, res, body, files) {
  const calls = files.map((file, index) => ({
    id: `synthetic_read_${index}`,
    name: 'read_file',
    input: { file_path: file },
  }));
  if (protocol === 'openai') {
    const chunk = (delta, finish) => ({
      id: 'chatcmpl-tools',
      object: 'chat.completion.chunk',
      created: 0,
      model: body.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    sse(res, [
      [
        null,
        chunk({ role: 'assistant', content: 'Reading synthetic files.' }, null),
      ],
      [
        null,
        chunk(
          {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: 'function',
              function: {
                name: call.name,
                arguments: JSON.stringify(call.input),
              },
            })),
          },
          null,
        ),
      ],
      [null, chunk({}, 'tool_calls')],
      [null, '[DONE]'],
    ]);
    return;
  }
  sse(res, [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_tools',
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [],
          stop_reason: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
    ],
    [
      'content_block_start',
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
    ],
    [
      'content_block_delta',
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Reading synthetic files.' },
      },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ...calls.flatMap((call, index) => [
      [
        'content_block_start',
        {
          type: 'content_block_start',
          index: index + 1,
          content_block: {
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: {},
          },
        },
      ],
      [
        'content_block_delta',
        {
          type: 'content_block_delta',
          index: index + 1,
          delta: {
            type: 'input_json_delta',
            partial_json: JSON.stringify(call.input),
          },
        },
      ],
      ['content_block_stop', { type: 'content_block_stop', index: index + 1 }],
    ]),
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { output_tokens: 2 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ]);
}

// The exact path each protocol's SDK requests; a doubled /v1 must not match.
function isProtocolPath(protocol, url) {
  const path = new URL(url ?? '/', 'http://localhost').pathname;
  return (
    path === (protocol === 'openai' ? '/v1/chat/completions' : '/v1/messages')
  );
}

// One server per protocol. Every request is recorded; the one that matters is
// the one on the protocol's own path.
function startProvider(protocol, reply, gateway = false) {
  const requests = [];
  const toolsSent = new Set();
  let toolFiles;
  let toolConversations;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        /* not JSON; recorded as empty */
      }
      requests.push({
        method: req.method,
        url: req.url,
        model: body.model,
        authorization: req.headers['authorization'],
        apiKey: req.headers['x-api-key'],
        ...(gateway
          ? {
              conversationId: req.headers['x-o1gw-conversation-id'],
              operationId: req.headers['x-o1gw-operation-id'],
              purpose: req.headers['x-o1gw-operation-purpose'],
              messages: body.messages,
            }
          : {}),
      });
      if (gateway && req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            data: [
              {
                id: 'o1gw/account/copilot/2/auto',
                native_model: 'auto',
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
      if (gateway && req.method === 'GET' && req.url === '/v1/key') {
        res.writeHead(200, { 'content-type': 'application/json' });
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
      if (req.method === 'POST' && isProtocolPath(protocol, req.url)) {
        const conversation = req.headers['x-o1gw-conversation-id'];
        if (
          toolFiles &&
          toolConversations.has(conversation) &&
          !req.headers['x-o1gw-operation-id'] &&
          !toolsSent.has(conversation)
        ) {
          toolsSent.add(conversation);
          gatewayToolReply(protocol, res, body, toolFiles);
          return;
        }
        reply(res, body, `PONG-${protocol}`);
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: `no route for ${req.method} ${req.url}` },
        }),
      );
    });
  });
  return new Promise((ready) =>
    server.listen(0, '127.0.0.1', () =>
      // The Anthropic SDK appends /v1/messages itself, so its base URL stops at
      // the host; the OpenAI SDK appends /chat/completions to a base that ends
      // in /v1.
      ready({
        setToolFiles(files, conversations) {
          toolFiles = files;
          toolConversations = new Set(conversations);
        },
        server,
        requests,
        baseUrl: `http://127.0.0.1:${server.address().port}${protocol === 'openai' ? '/v1' : ''}`,
      }),
    ),
  );
}

function runCli(home, env, args = []) {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [bundle, ...args, '-p', 'Reply with the word PONG.'],
      {
        cwd: home,
        env: {
          ...process.env,
          ...env,
          O1CODE_HOME: join(home, '.o1-code'),
          HOME: home,
          O1CODE_SANDBOX: 'false',
          NO_COLOR: '1',
        },
        windowsHide: true,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
  });
}

async function checkGateway(protocol, reply) {
  const provider = await startProvider(protocol, reply, true);
  const home = mkdtempSync(join(tmpdir(), `o1-gateway-smoke-${protocol}-`));
  const model = 'o1gw/account/copilot/2/auto';
  const sessions = [randomUUID(), randomUUID()];
  try {
    const files = ['alpha', 'beta'].map((name) => join(home, `${name}.txt`));
    for (const [index, file] of files.entries())
      writeFileSync(file, `synthetic-file-marker-${index}\n`);
    provider.setToolFiles(files, sessions);
    mkdirSync(join(home, '.o1-code'), { recursive: true });
    writeFileSync(
      join(home, '.o1-code', 'settings.json'),
      JSON.stringify({
        modelProviders: {
          [protocol]: [
            {
              id: model,
              baseUrl: provider.baseUrl,
              envKey: 'O1_GATEWAY_SMOKE_KEY',
            },
          ],
        },
        security: { auth: { selectedType: protocol } },
        model: { name: model },
        fastModel: `${protocol}:${model}`,
      }),
    );
    const problems = [];
    const openings = new Map();
    const normalizedMessages = (messages) =>
      JSON.parse(
        JSON.stringify(
          messages
            .map((message) => ({
              ...message,
              content:
                typeof message.content === 'string'
                  ? [{ type: 'text', text: message.content }]
                  : message.content,
            }))
            .map((message) => ({
              ...message,
              content:
                message.role === 'user' && Array.isArray(message.content)
                  ? message.content.filter(
                      (part) =>
                        part.type !== 'text' ||
                        !/^<system-reminder>[\s\S]*<\/system-reminder>\s*$/.test(
                          part.text,
                        ),
                    )
                  : message.content,
            }))
            .filter(
              (message) =>
                message.role !== 'user' ||
                !Array.isArray(message.content) ||
                message.content.length > 0,
            ),
          (key, value) => (key === 'cache_control' ? undefined : value),
        ),
      );
    for (const [index, session] of [...sessions, ...sessions].entries()) {
      const start = provider.requests.length;
      const run = await runCli(
        home,
        {
          O1_GATEWAY_SMOKE_KEY: 'synthetic-device-only',
        },
        [index < 2 ? '--session-id' : '--resume', session],
      );
      const completions = provider.requests
        .slice(start)
        .filter((row) => isProtocolPath(protocol, row.url));
      const main = completions.filter(
        (row) => row.conversationId === session && !row.operationId,
      );
      if (
        completions.some(
          (row) =>
            !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(
              row.conversationId ?? '',
            ) ||
            row.model !== model ||
            (sessions.includes(row.conversationId) &&
              row.conversationId !== session) ||
            Boolean(row.operationId) !== Boolean(row.purpose),
        )
      ) {
        problems.push(`client run ${index + 1}: invalid or mixed HTTP scope`);
        break;
      }
      if (run.code !== 0 || !run.stdout.includes(`PONG-${protocol}`)) {
        problems.push(
          `client run ${index + 1}: exit=${run.code}, ${run.stderr.slice(-500)}`,
        );
        break;
      }
      if (
        main.length !== (index < 2 ? 2 : 1) ||
        main.some(
          (row) => row.conversationId !== session || row.model !== model,
        )
      ) {
        problems.push(
          `client run ${index + 1}: wrong HTTP identity, route, or number of main requests`,
        );
        break;
      }
      const continuation = JSON.stringify(main.at(-1).messages);
      if (index < 2)
        openings.set(session, normalizedMessages(main[0].messages));
      else {
        const opening = openings.get(session);
        if (
          JSON.stringify(opening) !==
          JSON.stringify(
            normalizedMessages(main[0].messages).slice(0, opening.length),
          )
        ) {
          problems.push(
            `client run ${index + 1}: the resumed opening changed on the HTTP wire`,
          );
          break;
        }
      }
      if (
        !files.every((_file, fileIndex) =>
          continuation.includes(`synthetic-file-marker-${fileIndex}`),
        ) ||
        ![0, 1].every((toolIndex) =>
          continuation.includes(`synthetic_read_${toolIndex}`),
        )
      ) {
        problems.push(
          `client run ${index + 1}: parallel tool IDs or results were lost`,
        );
        break;
      }
    }
    const operations = provider.requests.filter((row) => row.operationId);
    if (
      operations.some(
        (row) =>
          !sessions.includes(row.conversationId) ||
          !['title', 'summary', 'compaction', 'suggestion'].includes(
            row.purpose,
          ),
      )
    )
      problems.push(
        'auxiliary headers do not match their conversation and advertised purpose',
      );
    return { protocol, problems, auxiliaryCalls: operations.length };
  } finally {
    provider.server.closeAllConnections();
    provider.server.close();
    rmSync(home, { recursive: true, force: true });
  }
}

async function check(protocol, reply, suffix) {
  const provider = await startProvider(protocol, reply);
  const home = mkdtempSync(join(tmpdir(), `o1-provider-smoke-${protocol}-`));
  const providerId = `o1-smoke-${protocol}`;
  const model = `smoke-${protocol}-model`;
  const envKey = `O1_SMOKE_${protocol.toUpperCase()}_KEY`;
  const key = `sk-smoke-${protocol}`;
  try {
    mkdirSync(join(home, '.o1-code'), { recursive: true });
    writeFileSync(
      join(home, '.o1-code', 'settings.json'),
      JSON.stringify(
        {
          modelProviders: {
            [providerId]: [
              { id: model, envKey, baseUrl: provider.baseUrl + suffix },
            ],
          },
          providerProtocol: { [providerId]: protocol },
          security: { auth: { selectedType: protocol } },
          model: { name: model },
        },
        null,
        2,
      ),
    );
    const run = await runCli(home, { [envKey]: key });
    const main = provider.requests.find((r) => isProtocolPath(protocol, r.url));
    // Anthropic-protocol requests to a host other than api.anthropic.com carry
    // the key as Authorization: Bearer, not x-api-key — deliberately, for
    // gateways that expect it — so either header counts.
    const sentKey = [main?.authorization, main?.apiKey]
      .filter(Boolean)
      .join(' ');
    const problems = [];
    if (run.code !== 0) problems.push(`exit code ${run.code}`);
    if (!run.stdout.includes(`PONG-${protocol}`))
      problems.push('the reply did not reach stdout');
    if (!main)
      problems.push(
        `no request reached ${protocol === 'openai' ? '/v1/chat/completions' : '/v1/messages'}`,
      );
    if (main && main.model !== model)
      problems.push(`model sent was ${main.model}, not ${model}`);
    if (main && !(sentKey ?? '').includes(key))
      problems.push('the configured key was not sent');
    return { protocol, problems, run, requests: provider.requests };
  } finally {
    provider.server.close();
    rmSync(home, { recursive: true, force: true });
  }
}

if (!existsSync(bundle)) {
  console.error(
    'provider-smoke: dist/cli.js not found; run `npm run bundle` first',
  );
  process.exit(2);
}

let failed = 0;
for (const [protocol, reply, suffix] of [
  ['openai', openaiReply, ''],
  ['anthropic', anthropicReply, ''],
  ['anthropic', anthropicReply, '/v1'],
]) {
  const label = suffix
    ? `${protocol} (base URL ending in ${suffix})`
    : protocol;
  const result = await check(protocol, reply, suffix);
  if (result.problems.length === 0) {
    console.log(
      `ok   ${label}: reply through a custom provider at its own URL`,
    );
    continue;
  }
  failed += 1;
  console.log(`FAIL ${label}: ${result.problems.join('; ')}`);
  console.log(
    `     requests: ${JSON.stringify(result.requests.map((r) => `${r.method} ${r.url} model=${r.model}`))}`,
  );
  console.log(`     stdout: ${result.run.stdout.slice(-400).trim()}`);
  console.log(`     stderr: ${result.run.stderr.slice(-800).trim()}`);
}
if (process.argv.includes('--gateway')) {
  for (const [protocol, reply] of [
    ['openai', openaiReply],
    ['anthropic', anthropicReply],
  ]) {
    const result = await checkGateway(protocol, reply);
    if (result.problems.length) {
      failed++;
      console.log(`FAIL gateway ${protocol}: ${result.problems.join('; ')}`);
    } else
      console.log(
        `ok   gateway ${protocol}: distinct HTTP identities, parallel tool results and process restarts; auxiliary calls=${result.auxiliaryCalls}`,
      );
  }
}
console.log(failed === 0 ? 'provider-smoke: PASS' : 'provider-smoke: FAIL');
process.exitCode = failed === 0 ? 0 : 1;
