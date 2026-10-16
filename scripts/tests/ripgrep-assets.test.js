/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyBundleAssets } from '../copy_bundle_assets.js';

const vendorDir = fileURLToPath(
  new URL('../../packages/core/vendor/ripgrep/', import.meta.url),
);

describe('bundled ripgrep platform assets', () => {
  let root;

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('copies a binary for every supported platform and architecture into the package', () => {
    root = mkdtempSync(path.join(tmpdir(), 'o1-code-ripgrep-assets-'));
    const target = path.join(root, 'packages/core/vendor/ripgrep');
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(vendorDir, target, { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    copyBundleAssets({ root });

    for (const relativePath of [
      'x64-linux/rg',
      'arm64-linux/rg',
      'x64-darwin/rg',
      'arm64-darwin/rg',
      'x64-win32/rg.exe',
      'arm64-win32/rg.exe',
    ]) {
      const binary = readFileSync(
        path.join(root, 'dist/vendor/ripgrep', relativePath),
      );
      expect(binary.length, relativePath).toBeGreaterThan(0);
      expect(
        createHash('sha256').update(binary).digest('hex'),
        relativePath,
      ).toBe(
        createHash('sha256')
          .update(readFileSync(path.join(vendorDir, relativePath)))
          .digest('hex'),
      );
      if (relativePath.endsWith('.exe')) {
        expect(binary.toString('ascii', 0, 2)).toBe('MZ');
        const peOffset = binary.readUInt32LE(0x3c);
        expect(binary.toString('ascii', peOffset, peOffset + 4)).toBe('PE\0\0');
        expect(binary.readUInt16LE(peOffset + 4)).toBe(
          relativePath.startsWith('arm64-') ? 0xaa64 : 0x8664,
        );
      }
    }
    for (const license of ['COPYING', 'LICENSE-MIT', 'UNLICENSE']) {
      expect(
        readFileSync(path.join(root, 'dist/vendor/ripgrep', license), 'utf8'),
      ).toBe(readFileSync(path.join(vendorDir, license), 'utf8'));
    }
  });
});
