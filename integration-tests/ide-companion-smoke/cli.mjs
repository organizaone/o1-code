// Copyright 2026 o1-code contributors
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';
const cli = join(process.argv[2], 'dist', 'o1-code-cli', 'cli.js');
const require = createRequire(cli);
const pty = require('@lydell/node-pty');
const env = { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' };
delete env.NO_COLOR;
const terminal = pty.spawn(process.execPath, [cli, '--yolo'], {
  cols: 120,
  rows: 35,
  cwd: process.argv[3],
  env,
});
let output = '';
let stage = 0;
let complete = false;
const timeout = setTimeout(
  () => finish(1, 'Timed out waiting for CLI/IDE connection'),
  60000,
);
function finish(code, message) {
  if (complete) return;
  complete = true;
  clearTimeout(timeout);
  terminal.kill();
  console.log(message);
  setTimeout(() => process.exit(code), 100);
}
function send(text) {
  terminal.write(text);
  setTimeout(() => terminal.write('\r'), 200);
}
terminal.onData((data) => {
  output = stripVTControlCharacters(output + data).slice(-200000);
  if (stage === 0 && output.includes('Type your message')) {
    stage = 1;
    setTimeout(() => send('/ide status'), 500);
  } else if (stage === 1 && output.includes('Connected to VS Code')) {
    stage = 2;
    setTimeout(() => send('Check the integration'), 500);
  } else if (stage === 2 && output.includes('COMPANION_SMOKE_OK'))
    finish(0, 'CLI connected to installed IDE companion and provider');
});
terminal.onExit(() => {
  if (!complete) finish(1, 'CLI exited before IDE integration validation');
});
