// Copyright 2026 o1-code contributors
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BRAND } from '../generated/brand.js';
import { fetchWithPolicy } from '../utils/fetch.js';

const DOWNLOAD_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

async function download(url: string, maxBytes: number): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const target = new URL(url);
      if (
        target.protocol !== 'https:' ||
        target.username ||
        target.password ||
        !DOWNLOAD_HOSTS.has(target.hostname) ||
        (target.port && target.port !== '443')
      ) {
        throw new Error('Unexpected companion download redirect.');
      }
      const result = await fetchWithPolicy(url, {
        timeoutMs: 120_000,
        maxBytes,
        maxRedirects: 5,
        signal: controller.signal,
      });
      if (result.kind === 'cross-host-redirect') {
        url = result.redirectUrl;
        continue;
      }
      if (result.status !== 200)
        throw new Error(`Companion download failed: HTTP ${result.status}.`);
      return result.body;
    }
    throw new Error('Too many companion download redirects.');
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadCompanionVsix(
  version: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      'A valid CLI release version is required to install the companion.',
    );
  }
  if (
    !['win32', 'darwin', 'linux'].includes(platform) ||
    !['x64', 'arm64'].includes(arch) ||
    (platform === 'linux' && arch !== 'x64')
  ) {
    throw new Error(
      `Companion releases are unavailable for ${platform}-${arch}.`,
    );
  }
  const name = `o1-code-vscode-ide-companion-${version}-${platform}-${arch}.vsix`;
  const url = `${BRAND.repoUrl}/releases/download/v${version}/${name}`;
  const checksumText = (await download(`${url}.sha256`, 1024))
    .toString('utf8')
    .trim();
  const checksum = checksumText.split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(checksum))
    throw new Error('Invalid companion checksum file.');
  const bytes = await download(url, 128 * 1024 * 1024);
  if (
    createHash('sha256').update(bytes).digest('hex') !== checksum.toLowerCase()
  ) {
    throw new Error('Companion checksum verification failed.');
  }
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50)
    throw new Error('Invalid companion VSIX archive.');
  const directory = await mkdtemp(join(tmpdir(), 'o1-code-companion-'));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  const path = join(directory, name);
  try {
    await writeFile(path, bytes);
    return { path, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
