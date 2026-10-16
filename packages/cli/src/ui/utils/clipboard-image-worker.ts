/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Worker } from 'node:worker_threads';
import { open, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolveBundleDir } from '@organizaone/o1-code-core/utils/bundlePaths.js';

const source = `
(async () => {
  const { parentPort, workerData } = await import('node:worker_threads');
  const mod = await import(workerData.moduleUrl);
  const ClipboardManager = mod.ClipboardManager ?? mod.default?.ClipboardManager;
  const clipboard = new ClipboardManager();
  if (!clipboard.hasFormat('image')) { parentPort.postMessage(null); return; }
  const image = clipboard.getImageData();
  if (!image.data?.length) { parentPort.postMessage(null); return; }
  parentPort.postMessage(image.data);
})().catch(error => { throw error; });
`;

export async function saveNativeClipboardImage(
  destination: string,
  signal?: AbortSignal,
): Promise<string | null> {
  signal?.throwIfAborted();
  const windows = process.platform === 'win32';
  const extension = fileURLToPath(import.meta.url).endsWith('.ts')
    ? 'ts'
    : 'js';
  const workerPath = path.join(
    resolveBundleDir(import.meta.url),
    `windows-clipboard-worker.${extension}`,
  );
  const bytes = await new Promise<Uint8Array | null>((resolve, reject) => {
    const worker = windows
      ? new Worker(workerPath)
      : new Worker(source, {
          eval: true,
          workerData: {
            moduleUrl: pathToFileURL(
              createRequire(import.meta.url).resolve('@teddyzhu/clipboard'),
            ).href,
          },
        });
    let settled = false;
    const finish = (value: unknown, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void worker
        .terminate()
        .then(() => {
          if (error) reject(error);
          else if (value === null) resolve(null);
          else if (
            !(value instanceof Uint8Array) ||
            value.length > 64 * 1024 * 1024
          )
            reject(
              new Error(
                'Clipboard image worker returned invalid or oversized image data',
              ),
            );
          else resolve(value.length ? value : null);
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
  if (!bytes) return null;
  signal?.throwIfAborted();
  const file = await open(destination, 'wx');
  let completed = false;
  try {
    signal?.throwIfAborted();
    await file.writeFile(bytes);
    await file.close();
    signal?.throwIfAborted();
    completed = true;
    return destination;
  } finally {
    await file.close().catch(() => {});
    if (!completed) await rm(destination, { force: true });
  }
}
