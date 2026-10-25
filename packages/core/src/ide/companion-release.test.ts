// Copyright 2026 o1-code contributors
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { downloadCompanionVsix } from './companion-release.js';
import { fetchWithPolicy } from '../utils/fetch.js';

vi.mock('../utils/fetch.js', () => ({ fetchWithPolicy: vi.fn() }));
const bytes = Buffer.from('PK\x03\x04companion');
const digest = createHash('sha256').update(bytes).digest('hex');
function response(body: Buffer, status = 200) {
  return {
    kind: 'response' as const,
    status,
    statusText: '',
    contentType: '',
    contentDisposition: '',
    body,
    finalUrl: 'https://github.com/asset',
  };
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());
describe('downloadCompanionVsix', () => {
  it('downloads the exact platform release, verifies its checksum and cleans up', async () => {
    vi.mocked(fetchWithPolicy)
      .mockResolvedValueOnce(response(Buffer.from(digest)))
      .mockResolvedValueOnce(response(bytes));
    const result = await downloadCompanionVsix('0.21.7', 'win32', 'x64');
    try {
      expect(fetchWithPolicy).toHaveBeenNthCalledWith(
        1,
        'https://github.com/organizaone/o1-code/releases/download/v0.21.7/o1-code-vscode-ide-companion-0.21.7-win32-x64.vsix.sha256',
        expect.any(Object),
      );
      expect(readFileSync(result.path)).toEqual(bytes);
    } finally {
      await result.cleanup();
    }
    expect(existsSync(result.path)).toBe(false);
  });
  it('follows the GitHub asset redirect without sending credentials', async () => {
    vi.mocked(fetchWithPolicy)
      .mockResolvedValueOnce({
        kind: 'cross-host-redirect',
        originalUrl: 'https://github.com/asset',
        redirectUrl:
          'https://release-assets.githubusercontent.com/asset?signature=test',
        status: 302,
      })
      .mockResolvedValueOnce(response(Buffer.from(digest)))
      .mockResolvedValueOnce(response(bytes));
    const result = await downloadCompanionVsix('0.21.7', 'darwin', 'arm64');
    await result.cleanup();
    expect(fetchWithPolicy).toHaveBeenNthCalledWith(
      2,
      'https://release-assets.githubusercontent.com/asset?signature=test',
      expect.not.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.any(String) }),
      }),
    );
  });
  it('rejects redirects outside GitHub release storage', async () => {
    vi.mocked(fetchWithPolicy).mockResolvedValueOnce({
      kind: 'cross-host-redirect',
      originalUrl: 'https://github.com/asset',
      redirectUrl: 'https://example.com/asset',
      status: 302,
    });
    await expect(
      downloadCompanionVsix('0.21.7', 'linux', 'x64'),
    ).rejects.toThrow('Unexpected companion download redirect');
    expect(fetchWithPolicy).toHaveBeenCalledTimes(1);
  });
  it('reports an unavailable release without suggesting the Marketplace', async () => {
    vi.mocked(fetchWithPolicy).mockResolvedValueOnce(
      response(Buffer.alloc(0), 404),
    );
    await expect(
      downloadCompanionVsix('0.21.7', 'linux', 'x64'),
    ).rejects.toThrow('HTTP 404');
  });
  it('rejects a corrupted VSIX before installing it', async () => {
    vi.mocked(fetchWithPolicy)
      .mockResolvedValueOnce(response(Buffer.from('0'.repeat(64))))
      .mockResolvedValueOnce(response(bytes));
    await expect(
      downloadCompanionVsix('0.21.7', 'linux', 'x64'),
    ).rejects.toThrow('checksum');
  });
  it('rejects a non-VSIX response even with a matching checksum', async () => {
    const body = Buffer.from('html');
    const hash = createHash('sha256').update(body).digest('hex');
    vi.mocked(fetchWithPolicy)
      .mockResolvedValueOnce(response(Buffer.from(hash)))
      .mockResolvedValueOnce(response(body));
    await expect(
      downloadCompanionVsix('0.21.7', 'linux', 'x64'),
    ).rejects.toThrow('VSIX archive');
  });
  it('reports unsupported native targets before downloading', async () => {
    await expect(
      downloadCompanionVsix('0.21.7', 'linux', 'arm64'),
    ).rejects.toThrow('unavailable');
    expect(fetchWithPolicy).not.toHaveBeenCalled();
  });
  it.each(['unknown', '../../main', '1.2.3-preview'])(
    'rejects invalid release version %s',
    async (version) => {
      await expect(
        downloadCompanionVsix(version, 'linux', 'x64'),
      ).rejects.toThrow('release version');
      expect(fetchWithPolicy).not.toHaveBeenCalled();
    },
  );
});
