/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Worker } from 'node:worker_threads';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const source = `
(async () => {
  const { parentPort, workerData } = await import('node:worker_threads');
  const fs = await import('node:fs/promises');
  const mod = await import(workerData.moduleUrl);
  const ClipboardManager = mod.ClipboardManager ?? mod.default?.ClipboardManager;
  const clipboard = new ClipboardManager();
  if (!clipboard.hasFormat('image')) { parentPort.postMessage(null); return; }
  const image = clipboard.getImageData();
  if (!image.data?.length) { parentPort.postMessage(null); return; }
  await fs.writeFile(workerData.destination, image.data, { flag: 'wx' });
  parentPort.postMessage(workerData.destination);
})().catch(error => { throw error; });
`;

export async function saveNativeClipboardImage(
  destination: string,
  signal?: AbortSignal,
): Promise<string | null> {
  signal?.throwIfAborted();
  const moduleUrl = pathToFileURL(
    createRequire(import.meta.url).resolve('@teddyzhu/clipboard'),
  ).href;
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: { moduleUrl, destination },
    });
    let settled = false;
    const finish = (value: unknown, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void worker
        .terminate()
        .then(async () => {
          if (error || value !== destination)
            await rm(destination, { force: true });
          if (error) reject(error);
          else resolve(value === destination ? destination : null);
        })
        .catch(reject);
    };
    const abort = () =>
      finish(
        null,
        new DOMException('Clipboard image preparation cancelled', 'AbortError'),
      );
    const timer = setTimeout(
      () => finish(null, new Error('Clipboard image preparation timed out')),
      120_000,
    );
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', (value) => finish(value));
    worker.once('error', (error) => finish(null, error));
    worker.once('exit', (code) => {
      if (!settled)
        finish(
          null,
          new Error(`Clipboard image worker exited without a result (${code})`),
        );
    });
    if (signal?.aborted) abort();
  });
}
