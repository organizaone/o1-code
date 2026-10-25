// Copyright 2026 o1-code contributors
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
exports.run = async function () {
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'),
  );
  const companion = vscode.extensions.getExtension(
    'organizaone.o1-code-vscode-ide-companion',
  );
  if (!companion || companion.packageJSON.version !== config.version)
    throw new Error('Matching installed companion not found');
  await companion.activate();
  if (!companion.isActive) throw new Error('Companion activation failed');
  await new Promise((resolve, reject) => {
    const child = spawn(
      config.node,
      [config.probe, companion.extensionPath, config.workspace],
      {
        env: { ...process.env, TERM_PROGRAM: 'vscode' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (data) => {
        output = (output + data.toString()).slice(-10000);
      });
    }
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('CLI/IDE smoke timed out\n' + output));
    }, 90000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('CLI/IDE smoke failed: ' + code + '\n' + output));
    });
  });
};
