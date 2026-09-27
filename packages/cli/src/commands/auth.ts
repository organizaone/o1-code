/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import type { Argv, CommandModule } from 'yargs';
import { Storage } from '@organizaone/o1-code-core/config/storage.js';
import {
  isValidCredentialId,
  removeCredential,
} from '@organizaone/o1-code-core/providers/credential-store.js';
import { t } from '../i18n/index.js';
import {
  loadSettings,
  SettingScope,
  type SettingsFile,
} from '../config/settings.js';

const shouldUseColor = () =>
  Boolean(process.stdout.isTTY && !process.env['NO_COLOR']);

const color = (value: string, code: string) =>
  shouldUseColor() ? `\x1b[${code}m${value}\x1b[0m` : value;

const cyan = (value: string) => color(value, '36');
const yellow = (value: string) => color(value, '33');

export const buildRemovalNotice = (): string =>
  [
    '',
    yellow(t('⚠  o1-code auth has been removed.')),
    '',
    `  ${cyan(t('Interactive'))}   →  ${t('run o1-code and use /auth to configure providers')}`,
    `  ${cyan(t('CI / Headless'))} →  ${t('set provider environment variables, for example OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL')}`,
    `                     ${t('or pass --openai-api-key, --openai-base-url, --model')}`,
    `  ${cyan(t('Coding Plan'))}   →  ${t('set BAILIAN_CODING_PLAN_API_KEY and use the Coding Plan base URL for your region')}`,
    `                     ${t('China: https://coding.dashscope.aliyuncs.com/v1')}`,
    `                     ${t('International: https://coding-intl.dashscope.aliyuncs.com/v1')}`,
    `  ${cyan(t('Token Plan'))}    →  ${t('set BAILIAN_TOKEN_PLAN_API_KEY and use the Token Plan base URL for your region')}`,
    `                     ${t('China: https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1')}`,
    `                     ${t('International: https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')}`,
    `  ${cyan(t('Scripted'))}      →  ${t('edit ~/.o1-code/settings.json, or run o1-code interactively once')}`,
    '',
    `  ${t('Check auth status')} → ${cyan('/doctor')}`,
    '',
  ].join('\n');

export const printRemovalNotice = () => {
  process.stdout.write(buildRemovalNotice(), () => process.exit(0));
};

const legacySubcommands = ['status', 'coding-plan', 'api-key'];

/** A settings view with the two calls the logout needs. */
export interface LogoutSettings {
  forScope(scope: SettingScope): SettingsFile;
  setValue(scope: SettingScope, key: string, value: unknown): void;
}

export interface LogoutResult {
  id: string;
  /** Whether a saved key was there to remove. */
  removedFile: boolean;
  file: string;
  /** Settings files whose model entries no longer name the credential. */
  references: Array<{ path: string; count: number }>;
}

/**
 * Forgets a provider's saved key: deletes `<home>/credentials/<id>.json` and
 * the `credential: "<id>"` reference of every model entry in the user and
 * workspace settings. Entries are rewritten from the raw file content so
 * `${VAR}` placeholders stay as written.
 */
export function logoutProvider(
  id: string,
  settings: LogoutSettings,
): LogoutResult {
  if (!isValidCredentialId(id)) {
    throw new Error(
      t(
        'Invalid credential id "{{id}}": use lowercase letters, digits and dashes.',
        { id },
      ),
    );
  }
  const file = path.join(Storage.getCredentialsDir(), `${id}.json`);
  const removedFile = removeCredential(id);
  const references: LogoutResult['references'] = [];
  for (const scope of [SettingScope.User, SettingScope.Workspace]) {
    const settingsFile = settings.forScope(scope);
    const providers = settingsFile.originalSettings.modelProviders as
      | Record<string, unknown>
      | undefined;
    let count = 0;
    for (const [bucket, models] of Object.entries(providers ?? {})) {
      if (!Array.isArray(models)) continue;
      let changed = false;
      const kept = models.map((model: unknown) => {
        if (
          !model ||
          typeof model !== 'object' ||
          (model as { credential?: unknown }).credential !== id
        ) {
          return model;
        }
        changed = true;
        count += 1;
        const { credential: _removed, ...rest } = model as Record<
          string,
          unknown
        >;
        return rest;
      });
      if (changed) settings.setValue(scope, `modelProviders.${bucket}`, kept);
    }
    if (count > 0) references.push({ path: settingsFile.path, count });
  }
  return { id, removedFile, file, references };
}

export function formatLogoutResult(result: LogoutResult): string {
  const lines = [
    result.removedFile
      ? t('Removed the saved key for {{id}} ({{file}}).', {
          id: result.id,
          file: result.file,
        })
      : t('No saved key for {{id}}.', { id: result.id }),
    ...result.references.map(({ path: file, count }) =>
      t(
        'Removed the credential reference from {{count}} model entries in {{file}}.',
        { count: String(count), file },
      ),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

const logoutCommand: CommandModule = {
  command: 'logout <id>',
  describe: t('Forget the saved API key of a provider'),
  builder: (yargs: Argv) =>
    yargs.positional('id', {
      type: 'string',
      describe: t('Provider id, as in ~/.o1-code/credentials/<id>.json'),
    }),
  handler: (argv) => {
    const id = String(argv['id'] ?? '');
    try {
      const result = logoutProvider(id, loadSettings(process.cwd()));
      process.stdout.write(formatLogoutResult(result));
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    }
  },
};

export const authCommand: CommandModule = {
  command: 'auth',
  describe: t('Configure authentication (removed)'),
  builder: (yargs: Argv) => {
    let y = yargs.version(false).strict(false).command(logoutCommand);
    for (const name of legacySubcommands) {
      y = y.command({
        command: `${name} [legacyArgs..]`,
        describe: false,
        builder: (subYargs: Argv) => subYargs.strict(false),
        handler: printRemovalNotice,
      });
    }
    return y;
  },
  handler: printRemovalNotice,
};
