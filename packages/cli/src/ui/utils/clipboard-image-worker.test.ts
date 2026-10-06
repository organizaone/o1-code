/** Copyright 2026 o1-code contributors. SPDX-License-Identifier: Apache-2.0 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { WorkerOptions } from 'node:worker_threads';
import { saveNativeClipboardImage } from './clipboard-image-worker.js';

const fixture = vi.hoisted(() => ({ url: '' }));
vi.mock('node:worker_threads', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:worker_threads')>();
  return {
    ...original,
    Worker: class extends original.Worker {
      constructor(filename: string | URL, options: WorkerOptions) {
        super(filename, {
          ...options,
          workerData: { ...options.workerData, moduleUrl: fixture.url },
        });
      }
    },
  };
});
let directory = '';
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function setup(body: string) {
  directory = await mkdtemp(join(tmpdir(), 'o1-code-clipboard-worker-'));
  const modulePath = join(directory, 'fixture.mjs');
  await writeFile(modulePath, `export class ClipboardManager { ${body} }`);
  fixture.url = pathToFileURL(modulePath).href;
  return join(directory, 'image.png');
}
describe('native clipboard image worker', () => {
  it('keeps the main event loop responsive while extracting a slow image', async () => {
    const destination = await setup(
      "hasFormat() { return true; } getImageData() { const until = Date.now() + 200; while (Date.now() < until) {} return {data: Buffer.from('image')}; }",
    );
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, 10);
    try {
      expect(await saveNativeClipboardImage(destination)).toBe(destination);
      expect(await readFile(destination, 'utf8')).toBe('image');
      expect(ticks).toBeGreaterThan(3);
    } finally {
      clearInterval(timer);
    }
  });
  it('terminates cancelled extraction and leaves no attachment file', async () => {
    const destination = await setup(
      'hasFormat() { return true; } getImageData() { while (true) {} }',
    );
    const controller = new AbortController();
    const operation = saveNativeClipboardImage(destination, controller.signal);
    setTimeout(() => controller.abort(), 40);
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await expect(access(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('returns null for a clipboard that holds no image', async () => {
    const destination = await setup('hasFormat() { return false; }');
    expect(await saveNativeClipboardImage(destination)).toBeNull();
    await expect(access(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('reports extraction errors without leaving a partial attachment', async () => {
    const destination = await setup(
      "hasFormat() { return true; } getImageData() { throw new Error('clipboard locked'); }",
    );
    await expect(saveNativeClipboardImage(destination)).rejects.toThrow(
      'clipboard locked',
    );
    await expect(access(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
