/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import('node:child_process');
  return {
    ...actual,
    execSync: vi.fn(),
    execFile: vi.fn((_command, _args, _options, callback) =>
      callback(null, '', ''),
    ),
  };
});
vi.mock('fs');
vi.mock('os');
vi.mock('./companion-release.js', () => ({ downloadCompanionVsix: vi.fn() }));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getIdeInstaller } from './ide-installer.js';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IDE_DEFINITIONS, type IdeInfo } from './detect-ide.js';
import { downloadCompanionVsix } from './companion-release.js';

describe('ide-installer', () => {
  const HOME_DIR = '/home/user';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(os, 'homedir').mockReturnValue(HOME_DIR);
    vi.mocked(downloadCompanionVsix).mockResolvedValue({
      path: '/tmp/companion package.vsix',
      cleanup: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getIdeInstaller', () => {
    it.each([
      { ide: IDE_DEFINITIONS.vscode },
      { ide: IDE_DEFINITIONS.firebasestudio },
    ])('returns a VsCodeInstaller for "$ide.name"', ({ ide }) => {
      const installer = getIdeInstaller(ide);

      expect(installer).not.toBeNull();
      expect(installer?.install).toEqual(expect.any(Function));
    });
  });

  describe('VsCodeInstaller', () => {
    function setup({
      ide = IDE_DEFINITIONS.vscode,
      existsResult = false,
      execSync = () => '',
      platform = 'linux' as NodeJS.Platform,
    }: {
      ide?: IdeInfo;
      existsResult?: boolean;
      execSync?: () => string;
      platform?: NodeJS.Platform;
    } = {}) {
      vi.spyOn(child_process, 'execSync').mockImplementation(execSync);
      vi.spyOn(fs, 'existsSync').mockReturnValue(existsResult);
      const installer = getIdeInstaller(ide, platform, '0.21.7')!;

      return { installer };
    }

    describe('install', () => {
      it.each([
        {
          platform: 'win32' as NodeJS.Platform,
          expectedLookupPaths: [
            path.join('C:\\Program Files', 'Microsoft VS Code/bin/code.cmd'),
            path.join(
              HOME_DIR,
              '/AppData/Local/Programs/Microsoft VS Code/bin/code.cmd',
            ),
          ],
        },
        {
          platform: 'darwin' as NodeJS.Platform,
          expectedLookupPaths: [
            '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
            path.join(HOME_DIR, 'Library/Application Support/Code/bin/code'),
          ],
        },
        {
          platform: 'linux' as NodeJS.Platform,
          expectedLookupPaths: ['/usr/share/code/bin/code'],
        },
      ])(
        'identifies the path to code cli on platform: $platform',
        async ({ platform, expectedLookupPaths }) => {
          const { installer } = setup({
            platform,
            execSync: () => {
              throw new Error('Command not found'); // `code` is not in PATH
            },
          });
          await installer.install();
          for (const [idx, path] of expectedLookupPaths.entries()) {
            expect(fs.existsSync).toHaveBeenNthCalledWith(idx + 1, path);
          }
        },
      );

      it('installs the extension using code cli', async () => {
        const { installer } = setup({
          platform: 'linux',
        });
        await installer.install();

        expect(downloadCompanionVsix).toHaveBeenCalledWith(
          '0.21.7',
          'linux',
          process.arch,
        );
        expect(child_process.execFile).toHaveBeenCalledWith(
          'code',
          ['--install-extension', '/tmp/companion package.vsix', '--force'],
          {
            shell: false,
            windowsHide: true,
            timeout: 120_000,
            maxBuffer: 1024 * 1024,
          },
          expect.any(Function),
        );
      });

      it('cleans up the VSIX and preserves the installation failure', async () => {
        const cleanup = vi.fn().mockResolvedValue(undefined);
        vi.mocked(downloadCompanionVsix).mockResolvedValue({
          path: '/tmp/companion.vsix',
          cleanup,
        });
        vi.mocked(child_process.execFile).mockImplementationOnce(() => {
          throw new Error('VS Code process failed');
        });
        const { installer } = setup();
        const result = await installer.install();
        expect(result.success).toBe(false);
        expect(result.message).toContain('VS Code process failed');
        expect(result.message).toContain('GitHub');
        expect(cleanup).toHaveBeenCalledOnce();
      });

      it('reports download errors without starting VS Code', async () => {
        vi.mocked(downloadCompanionVsix).mockRejectedValue(
          new Error('Companion download failed: HTTP 404.'),
        );
        const { installer } = setup();
        const result = await installer.install();
        expect(result.success).toBe(false);
        expect(result.message).toContain('HTTP 404');
        expect(child_process.execFile).not.toHaveBeenCalled();
      });
      it('quotes Windows executable and VSIX paths containing spaces', async () => {
        const { installer } = setup({
          platform: 'win32',
          execSync: () =>
            'C:\\Program Files\\VS Code\\bin\\code.cmd\r\nC:\\other\\code.cmd',
        });
        expect((await installer.install()).success).toBe(true);
        expect(child_process.execFile).toHaveBeenCalledWith(
          '"C:\\Program Files\\VS Code\\bin\\code.cmd"',
          ['--install-extension', '"/tmp/companion package.vsix"', '--force'],
          expect.objectContaining({ shell: true, timeout: 120_000 }),
          expect.any(Function),
        );
      });
      it('keeps the installation result if temporary cleanup fails', async () => {
        vi.mocked(downloadCompanionVsix).mockResolvedValue({
          path: '/tmp/companion.vsix',
          cleanup: vi.fn().mockRejectedValue(new Error('File busy')),
        });
        const { installer } = setup();
        expect((await installer.install()).success).toBe(true);
      });

      it.each([
        {
          ide: IDE_DEFINITIONS.vscode,
          expectedMessage:
            'VS Code companion extension was installed successfully',
        },
        {
          ide: IDE_DEFINITIONS.firebasestudio,
          expectedMessage:
            'Firebase Studio companion extension was installed successfully',
        },
      ])(
        'returns that the cli was installed successfully',
        async ({ ide, expectedMessage }) => {
          const { installer } = setup({ ide });
          const result = await installer.install();
          expect(result.success).toBe(true);
          expect(result.message).toContain(expectedMessage);
        },
      );

      it.each([
        {
          ide: IDE_DEFINITIONS.vscode,
          expectedErr: 'VS Code CLI not found',
        },
        {
          ide: IDE_DEFINITIONS.firebasestudio,
          expectedErr: 'Firebase Studio CLI not found',
        },
      ])(
        'should return a failure message if $ide is not installed',
        async ({ ide, expectedErr }) => {
          const { installer } = setup({
            ide,
            execSync: () => {
              throw new Error('Command not found');
            },
            existsResult: false,
          });
          const result = await installer.install();
          expect(result.success).toBe(false);
          expect(result.message).toContain(expectedErr);
        },
      );
    });
  });
});
