#!/usr/bin/env node
// Copyright 2026 o1-code contributors
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function createSmokeEnvironment(home, environment = process.env) {
  const scoop = environment.USERPROFILE
    ? path.join(environment.USERPROFILE, 'scoop')
    : undefined;
  return {
    ...environment,
    ...(environment.SCOOP || !scoop || !existsSync(scoop)
      ? {}
      : { SCOOP: scoop }),
    // Store activation depends on the real USERPROFILE when Node starts.
    HOME: home,
    O1CODE_HOME: path.join(home, '.o1-code'),
    O1CODE_NO_RELAUNCH: 'true',
    O1CODE_SANDBOX: 'false',
    O1_SHELL_SMOKE_KEY: 'sk-local-smoke',
    NO_COLOR: '1',
  };
}

export function quoteArgument(value, shell) {
  if (shell === 'bash') return `'${value.replaceAll("'", "'\\''")}'`;
  if (shell === 'powershell') return `'${value.replaceAll("'", "''")}'`;
  return `"${value.replaceAll('"', '""')}"`;
}

export function assessFixture(observed, expected) {
  if (!observed || !Array.isArray(observed.args))
    return { status: 'fail', detail: 'No result from the actual shell tool' };
  if (JSON.stringify(observed.args) === JSON.stringify(expected))
    return {
      status: 'pass',
      detail: 'UTF-8, spaces and argument array preserved',
    };
  const slash = expected.indexOf('/flag');
  if (
    slash >= 0 &&
    observed.args.length === expected.length &&
    observed.args.every(
      (value, index) => index === slash || value === expected[index],
    )
  ) {
    return {
      status: 'unverified',
      detail: `Native /flag argument changed to ${observed.args[slash]}; MSYS conversion requires separate assessment`,
    };
  }
  return {
    status: 'fail',
    detail: `Arguments changed: ${JSON.stringify(observed.args)}`,
  };
}

function reply(res, model, toolCall) {
  const delta = toolCall
    ? {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'shell-probe',
            type: 'function',
            function: {
              name: 'run_shell_command',
              arguments: JSON.stringify(toolCall),
            },
          },
        ],
      }
    : { role: 'assistant', content: 'SHELL-PROBE-OK' };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const [part, finish] of [
    [delta, null],
    [{}, toolCall ? 'tool_calls' : 'stop'],
  ]) {
    res.write(
      `data: ${JSON.stringify({ id: 'probe', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta: part, finish_reason: finish }] })}\n\n`,
    );
  }
  res.end('data: [DONE]\n\n');
}

async function runCase(cli, selection, label, preserveNativeArguments = false) {
  const home = mkdtempSync(path.join(tmpdir(), 'o1-shell-smoke-'));
  const fixture = path.join(home, 'space ação');
  mkdirSync(fixture);
  mkdirSync(path.join(home, '.o1-code'));
  const args = [
    'space value',
    'ação',
    '/flag',
    '--class-path',
    'lib one;lib two',
  ];
  const output = path.join(fixture, 'argv.json');
  const script = path.join(fixture, 'capture.cjs');
  writeFileSync(
    script,
    `require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));console.log('ACTUAL-SHELL-OK');`,
  );
  const shell =
    selection.type === 'powershell'
      ? 'powershell'
      : selection.type === 'cmd'
        ? 'cmd'
        : 'bash';
  const prefix =
    shell === 'powershell'
      ? '& '
      : shell === 'bash' && preserveNativeArguments
        ? 'MSYS_NO_PATHCONV=1 '
        : '';
  const command = `${prefix}${[process.execPath, script, ...args].map((value) => quoteArgument(value, shell)).join(' ')}`;
  const trace = path.join(home, 'children.jsonl');
  writeFileSync(trace, '');
  const preloader = path.join(home, 'trace.mjs');
  writeFileSync(
    preloader,
    `import cp from 'node:child_process';import{appendFileSync}from'node:fs';import{syncBuiltinESMExports}from'node:module';for(const name of ['spawn','spawnSync','execFile','execFileSync']){const original=cp[name];cp[name]=function(...args){appendFileSync(${JSON.stringify(trace)},JSON.stringify({name,command:args[0],args:Array.isArray(args[1])?args[1]:[]})+'\\n');return Reflect.apply(original,this,args)}}syncBuiltinESMExports();`,
  );
  let calls = 0;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      if (!req.url.endsWith('/chat/completions')) {
        res.writeHead(404);
        res.end();
        return;
      }
      reply(
        res,
        body.model,
        calls++ === 0
          ? {
              command,
              description: 'Validate disposable Windows shell arguments',
              timeout: 15000,
            }
          : undefined,
      );
    });
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  writeFileSync(
    path.join(home, '.o1-code', 'settings.json'),
    JSON.stringify({
      modelProviders: {
        'local-smoke': [
          {
            id: 'smoke-model',
            envKey: 'O1_SHELL_SMOKE_KEY',
            baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          },
        ],
      },
      providerProtocol: { 'local-smoke': 'openai' },
      security: { auth: { selectedType: 'openai' } },
      model: { name: 'smoke-model' },
      general: { preventSystemSleep: false, enableAutoUpdate: false },
      tools: { shell: { ...selection, enableInteractiveShell: false } },
    }),
  );
  let stdout = '',
    stderr = '';
  const child = spawn(
    process.execPath,
    [
      '--import',
      pathToFileURL(preloader).href,
      cli,
      '-y',
      '-p',
      'Run the requested disposable shell validation tool.',
    ],
    {
      cwd: home,
      env: createSmokeEnvironment(home),
    },
  );
  child.stdout.on('data', (data) => (stdout += data));
  child.stderr.on('data', (data) => (stderr += data));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 90000);
  const code = await new Promise((done) => child.on('close', done));
  clearTimeout(timer);
  server.close();
  const events = readFileSync(trace, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const actual = existsSync(output)
    ? JSON.parse(readFileSync(output, 'utf8'))
    : undefined;
  const result = assessFixture(actual, args);
  const expectedPattern =
    shell === 'bash'
      ? /bash\.exe$/i
      : shell === 'powershell'
        ? /(?:powershell|pwsh)\.exe$/i
        : /cmd\.exe$/i;
  const launch = events.find(
    (event) =>
      expectedPattern.test(event.command) &&
      event.args.some((argument) => argument.includes(command)),
  );
  if (!launch) {
    result.status = 'fail';
    result.detail += '; selected shell execution was not observed';
  }
  if (code !== 0 || timedOut || !stdout.includes('SHELL-PROBE-OK')) {
    result.status = 'fail';
    result.detail += `; CLI exit ${code}, timeout ${timedOut}`;
  }
  const evidence = {
    label,
    ...result,
    home,
    selection,
    command,
    code,
    actual,
    launch,
    events,
    stdout,
    stderr,
  };
  writeFileSync(
    path.join(home, 'result.json'),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    `${result.status.toUpperCase()} ${label}: ${result.detail} (evidence: ${home})`,
  );
  return evidence;
}

async function main() {
  const cliIndex = process.argv.indexOf('--cli');
  const cli = process.argv[cliIndex + 1];
  if (cliIndex < 0 || !cli || !path.isAbsolute(cli) || !existsSync(cli))
    throw new Error(
      'Usage: node windows-shell-smoke.mjs --cli <absolute-entry-path>',
    );
  if (process.platform !== 'win32') {
    console.log('UNVERIFIED Windows shell matrix: requires Windows');
    return;
  }
  const cases = [
    [{ type: 'auto' }, 'auto Git Bash'],
    [{ type: 'git-bash' }, 'explicit Git Bash'],
    [
      { type: 'git-bash' },
      'Git Bash with scoped native argument preservation',
      true,
    ],
    [
      {
        type: 'powershell',
        executable: path.join(
          process.env.SystemRoot || 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        ),
      },
      'explicit PowerShell 5.1',
    ],
    [{ type: 'cmd' }, 'explicit CMD'],
  ];
  if (process.env.O1_SHELL_SMOKE_PWSH)
    cases.push([
      { type: 'powershell', executable: process.env.O1_SHELL_SMOKE_PWSH },
      'explicit PowerShell 7',
    ]);
  else
    console.log(
      'UNVERIFIED PowerShell 7: set O1_SHELL_SMOKE_PWSH to a runnable absolute executable',
    );
  let failed = false;
  for (const [selection, label, preserveNativeArguments] of cases) {
    const { status } = await runCase(
      cli,
      selection,
      label,
      preserveNativeArguments,
    );
    if (status === 'fail' || (preserveNativeArguments && status !== 'pass'))
      failed = true;
  }
  console.log(
    'UNVERIFIED UNC, npm.cmd and cancellation: dedicated Windows fixtures are still required',
  );
  process.exitCode = failed ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
