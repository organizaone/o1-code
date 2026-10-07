/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { simpleGit } from 'simple-git';
import type { SimpleGit, SimpleGitFactory, SimpleGitOptions } from 'simple-git';
import { createExtensionGitClient } from './extension-git-client.js';

const realSimpleGit = ((
  baseDir: string,
  options?: Partial<SimpleGitOptions>,
) => {
  const binary = process.env['O1CODE_CI_REAL_GIT'];
  return simpleGit(baseDir, binary ? { ...options, binary } : options);
}) as SimpleGitFactory;

describe('createExtensionGitClient', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extension-git-client-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('runs authenticated Git commands with pinned network config', async () => {
    let spawned = false;
    const git = createExtensionGitClient(realSimpleGit, {
      baseDir: tempDir,
      networkPolicy: 'public',
      networkConfig: [
        'http.curloptResolve=git.example.com:443:8.8.8.8',
        'http.followRedirects=false',
        'http.proxy=',
        'protocol.allow=never',
        'protocol.https.allow=always',
      ],
      authentication: {
        source: 'https://git.example.com/owner/repo.git',
        credential: { username: 'user', password: 'token' },
      },
    });
    git.outputHandler(() => {
      spawned = true;
    });

    await expect(git.version()).resolves.toBeDefined();
    expect(spawned).toBe(true);
  });

  it('runs authenticated Git commands without pinned network config', async () => {
    let spawned = false;
    const git = createExtensionGitClient(realSimpleGit, {
      baseDir: tempDir,
      authentication: {
        source: 'https://git.example.com/owner/repo.git',
        credential: { username: 'user', password: 'token' },
      },
    });
    git.outputHandler(() => {
      spawned = true;
    });

    await expect(git.version()).resolves.toBeDefined();
    expect(spawned).toBe(true);
  });

  it.each([
    'http://git.example.com/owner/repo.git',
    '--upload-pack=attacker-command',
    'https://github.com\\@attacker.example/repo.git',
    'https://user:pass@git.example.com/owner/repo.git',
    'https://git.example.com/owner/repo.git\n',
  ])('rejects unsafe credentialed Git source %s', (source) => {
    expect(() =>
      createExtensionGitClient(realSimpleGit, {
        baseDir: tempDir,
        authentication: {
          source,
          credential: { username: 'user', password: 'token' },
        },
      }),
    ).toThrow(
      'Credentialed Git operations require a valid HTTPS repository URL.',
    );
  });

  it.each([
    ['alias', 'https://github.com/owner/alias-service.git'],
    [
      'credential helper',
      'https://git.example.com/owner/credential.helper.git',
    ],
    ['diff tool', 'https://git.example.com/owner/difftool.audit.cmd.git'],
    [
      'filter process',
      'https://git.example.com/owner/filter.audit.process.git',
    ],
    ['include', 'https://git.example.com/owner/include.path.git'],
    ['conditional include', 'https://git.example.com/owner/includeIf.git'],
    ['pager', 'https://git.example.com/owner/pager.audit.git'],
    [
      'upload pack hook',
      'https://git.example.com/owner/uploadpack.packObjectsHook.git',
    ],
    ['submodule', 'https://git.example.com/owner/submodule.audit.update.git'],
    ['archive command', 'https://git.example.com/owner/tar.audit.command.git'],
    ['trailer cmd', 'https://git.example.com/owner/trailer.audit.cmd.git'],
    [
      'trailer command',
      'https://git.example.com/owner/trailer.audit.command.git',
    ],
    ['URL rewrite', 'https://git.example.com/owner/url.audit.insteadOf.git'],
  ])(
    'runs authenticated Git commands when the URL contains %s text',
    async (_label, source) => {
      let spawned = false;
      const git = createExtensionGitClient(realSimpleGit, {
        baseDir: tempDir,
        authentication: {
          source,
          credential: { username: 'user', password: 'token' },
        },
      });
      git.outputHandler(() => {
        spawned = true;
      });

      await expect(git.version()).resolves.toBeDefined();
      expect(spawned).toBe(true);
    },
  );

  it('does not allow unrelated unsafe config for a URL false positive', async () => {
    let spawned = false;
    const git = createExtensionGitClient(realSimpleGit, {
      baseDir: tempDir,
      authentication: {
        source: 'https://github.com/owner/alias-service.git',
        credential: { username: 'user', password: 'token' },
      },
    });
    git.outputHandler(() => {
      spawned = true;
    });

    await expect(
      git.raw(['-c', 'credential.helper=store', '--version']),
    ).rejects.toThrow('allowUnsafeCredentialHelper');
    expect(spawned).toBe(false);
  });

  it('does not inherit Git config count for anonymous public commands', async () => {
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'http.extraHeader');
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'Authorization: Basic external');
    let spawned = false;
    const git = createExtensionGitClient(realSimpleGit, {
      baseDir: tempDir,
      networkPolicy: 'public',
    });
    git.outputHandler(() => {
      spawned = true;
    });

    await expect(git.version()).resolves.toBeDefined();
    expect(spawned).toBe(true);
  });

  it('passes only the scoped authentication header to the Git child', async () => {
    vi.stubEnv('GIT_CONFIG_COUNT', '2');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'http.extraHeader');
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'Authorization: Basic ambient');
    vi.stubEnv('GIT_CONFIG_KEY_1', 'trailer.audit.cmd');
    vi.stubEnv('GIT_CONFIG_VALUE_1', 'ambient-command');
    vi.stubEnv('VISUAL', 'ambient-editor');
    const source = 'https://git.example.com/owner/repo.git';
    const git = createExtensionGitClient(realSimpleGit, {
      baseDir: tempDir,
      authentication: {
        source,
        credential: { username: 'test-user', password: 'test-token' },
      },
    });

    const value = await git.raw([
      'config',
      '--get',
      `http.${source}.extraHeader`,
    ]);
    expect(value.trim()).toBe(
      `Authorization: Basic ${Buffer.from('test-user:test-token').toString('base64')}`,
    );
    const config = await git.raw(['config', '--list']);
    expect(config).not.toContain('http.extraheader=');
    expect(config).not.toContain('trailer.audit.cmd=');
  });

  it('does not authorize additional Git environment keys', async () => {
    let spawned = false;
    const git = createExtensionGitClient(realSimpleGit, {
      baseDir: tempDir,
      networkPolicy: 'public',
    });
    git.outputHandler(() => {
      spawned = true;
    });
    git.env('GIT_DIR', tempDir);

    await expect(git.version()).rejects.toThrow('allowEnvironment');
    expect(spawned).toBe(false);
  });

  it('does not inherit ambient secrets into restricted environments', () => {
    vi.stubEnv('GITHUB_TOKEN', 'ambient-github-token');
    vi.stubEnv('gh_token', 'ambient-gh-token');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'ambient-aws-secret');
    const environments: Array<Record<string, string>> = [];
    const fakeGit = {
      env: (environment: Record<string, string>) => {
        environments.push(environment);
        return fakeGit;
      },
    } as unknown as SimpleGit;
    const factory = (() => fakeGit) as unknown as SimpleGitFactory;

    createExtensionGitClient(factory, {
      baseDir: tempDir,
      networkPolicy: 'public',
    });
    createExtensionGitClient(factory, {
      baseDir: tempDir,
      authentication: {
        source: 'https://git.example.com/owner/repo.git',
        credential: { username: 'user', password: 'token' },
      },
    });

    expect(environments).toHaveLength(2);
    for (const environment of environments) {
      expect(environment).not.toHaveProperty('GITHUB_TOKEN');
      expect(environment).not.toHaveProperty('gh_token');
      expect(environment).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
      expect(environment).toHaveProperty('GIT_CONFIG_NOSYSTEM', '1');
    }
    expect(environments[1]).toHaveProperty(
      'GIT_CONFIG_KEY_0',
      'http.https://git.example.com/owner/repo.git.extraHeader',
    );
  });
});
