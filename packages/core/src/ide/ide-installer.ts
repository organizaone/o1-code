/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'node:child_process';
import * as process from 'node:process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { IDE_DEFINITIONS, type IdeInfo } from './detect-ide.js';
import { O1CODE_COMPANION_EXTENSION_NAME } from './constants.js';
import { downloadCompanionVsix } from './companion-release.js';
import { BRAND } from '../generated/brand.js';

function getVsCodeCommand(platform: NodeJS.Platform = process.platform) {
  return platform === 'win32' ? 'code.cmd' : 'code';
}

export interface IdeInstaller {
  install(): Promise<InstallResult>;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

async function findVsCodeCommand(
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  // 1. Check PATH first.
  const vscodeCommand = getVsCodeCommand(platform);
  try {
    if (platform === 'win32') {
      const result = child_process
        .execSync(`where.exe ${vscodeCommand}`)
        .toString()
        .trim();
      // `where.exe` can return multiple paths. Return the first one.
      const firstPath = result.split(/\r?\n/)[0];
      if (firstPath) {
        return firstPath;
      }
    } else {
      child_process.execSync(`command -v ${vscodeCommand}`, {
        stdio: 'ignore',
      });
      return vscodeCommand;
    }
  } catch {
    // Not in PATH, continue to check common locations.
  }

  // 2. Check common installation locations.
  const locations: string[] = [];
  const homeDir = os.homedir();

  if (platform === 'darwin') {
    // macOS
    locations.push(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      path.join(homeDir, 'Library/Application Support/Code/bin/code'),
    );
  } else if (platform === 'linux') {
    // Linux
    locations.push(
      '/usr/share/code/bin/code',
      '/snap/bin/code',
      path.join(homeDir, '.local/share/code/bin/code'),
    );
  } else if (platform === 'win32') {
    // Windows
    locations.push(
      path.join(
        process.env['ProgramFiles'] || 'C:\\Program Files',
        'Microsoft VS Code',
        'bin',
        'code.cmd',
      ),
      path.join(
        homeDir,
        'AppData',
        'Local',
        'Programs',
        'Microsoft VS Code',
        'bin',
        'code.cmd',
      ),
    );
  }

  for (const location of locations) {
    if (fs.existsSync(location)) {
      return location;
    }
  }

  return null;
}

class VsCodeInstaller implements IdeInstaller {
  private vsCodeCommand: Promise<string | null>;

  constructor(
    readonly ideInfo: IdeInfo,
    readonly platform = process.platform,
    readonly version?: string,
  ) {
    this.vsCodeCommand = findVsCodeCommand(platform);
  }

  async install(): Promise<InstallResult> {
    const commandPath = await this.vsCodeCommand;
    if (!commandPath) {
      return {
        success: false,
        message: `${this.ideInfo.displayName} CLI not found. Please ensure 'code' is in your system's PATH. You can also install '${O1CODE_COMPANION_EXTENSION_NAME}' from a VSIX at ${BRAND.repoUrl}/releases.`,
      };
    }

    const isWindows = this.platform === 'win32';
    let archive: Awaited<ReturnType<typeof downloadCompanionVsix>> | undefined;
    try {
      archive = await downloadCompanionVsix(
        this.version ?? '',
        this.platform,
        process.arch,
      );
      const archivePath = archive.path;
      await new Promise<void>((resolve, reject) => {
        child_process.execFile(
          isWindows ? `"${commandPath}"` : commandPath,
          [
            '--install-extension',
            isWindows ? `"${archivePath}"` : archivePath,
            '--force',
          ],
          {
            shell: isWindows,
            windowsHide: true,
            timeout: 120_000,
            maxBuffer: 1024 * 1024,
          },
          (error, stdout, stderr) => {
            if (error)
              reject(
                new Error(
                  (
                    stderr?.toString().trim() ||
                    stdout?.toString().trim() ||
                    error.message
                  ).slice(0, 1000),
                ),
              );
            else resolve();
          },
        );
      });

      return {
        success: true,
        message: `${this.ideInfo.displayName} companion extension was installed successfully.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install ${this.ideInfo.displayName} companion extension: ${error instanceof Error ? error.message : String(error)} Download the matching VSIX from GitHub: ${BRAND.repoUrl}/releases.`,
      };
    } finally {
      // Cleanup must not turn an installation result into an unhandled error.
      await archive?.cleanup().catch(() => undefined);
    }
  }
}

export function getIdeInstaller(
  ide: IdeInfo,
  platform = process.platform,
  version?: string,
): IdeInstaller | null {
  switch (ide.name) {
    case IDE_DEFINITIONS.vscode.name:
    case IDE_DEFINITIONS.firebasestudio.name:
      return new VsCodeInstaller(ide, platform, version);
    default:
      return null;
  }
}
