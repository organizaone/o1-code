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

// The exact path each protocol's SDK requests; a doubled /v1 must not match.
function isProtocolPath(protocol, url) {
  const path = new URL(url ?? '/', 'http://localhost').pathname;
  return (
    path === (protocol === 'openai' ? '/v1/chat/completions' : '/v1/messages')
  );
}

// One server per protocol. Every request is recorded; the one that matters is
// the one on the protocol's own path.
function startProvider(protocol, reply) {
  const requests = [];
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
      });
      if (req.method === 'POST' && isProtocolPath(protocol, req.url)) {
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
        server,
        requests,
        baseUrl: `http://127.0.0.1:${server.address().port}${protocol === 'openai' ? '/v1' : ''}`,
      }),
    ),
  );
}

function runCli(home, env) {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [bundle, '-p', 'Reply with the word PONG.'],
      {
        cwd: home,
        env: {
          ...process.env,
          ...env,
          O1CODE_HOME: join(home, '.o1-code'),
          HOME: home,
          USERPROFILE: home,
          O1CODE_SANDBOX: 'false',
          NO_COLOR: '1',
        },
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
console.log(failed === 0 ? 'provider-smoke: PASS' : 'provider-smoke: FAIL');
process.exitCode = failed === 0 ? 0 : 1;
