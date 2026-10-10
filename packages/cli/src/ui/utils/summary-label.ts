/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { t, localizeToolDisplayName } from '../../i18n/index.js';
import type { IndividualToolCallDisplay } from '../types.js';
import { getToolCategory } from '../components/messages/CompactToolGroupDisplay.js';
import { sanitizeTerminalText } from './textUtils.js';

const MCP_DISPLAY_NAME = /^(.+) \((.+) MCP Server\)$/;

// Programs whose first argument names the action ("npm test", "git status"),
// so the label keeps it; every other argument is left out.
const SUBCOMMAND_PROGRAMS = new Set([
  'bun',
  'cargo',
  'deno',
  'docker',
  'dotnet',
  'git',
  'go',
  'gradle',
  'kubectl',
  'make',
  'mvn',
  'npm',
  'npx',
  'pnpm',
  'yarn',
]);

const PATH_ARGS = ['file_path', 'absolute_path', 'path', 'notebook_path'];
const QUERY_ARGS = ['pattern', 'query'];

/** One line of terminal-safe text. */
export function oneLine(value: string): string {
  return sanitizeTerminalText(value).replace(/\s+/g, ' ').trim();
}

function stringArg(
  tool: IndividualToolCallDisplay,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = tool.args?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

/** The file name a tool works on, without its directories. */
export function summaryTarget(
  tool: IndividualToolCallDisplay,
): string | undefined {
  const raw = stringArg(tool, PATH_ARGS) ?? tool.description;
  const cleaned = raw ? oneLine(raw) : '';
  if (!cleaned || cleaned.startsWith('{')) return undefined;
  return path.basename(cleaned.split(' ')[0] ?? cleaned) || undefined;
}

/** The program a shell command runs, plus its subcommand when it has one. */
export function commandProgram(command: string): string {
  const words = oneLine(command).split(' ').filter(Boolean);
  const program = path.basename(words[0] ?? '');
  const next = words[1];
  if (next && SUBCOMMAND_PROGRAMS.has(program) && /^[a-z][\w:-]*$/.test(next)) {
    return `${program} ${next}`;
  }
  return program;
}

/**
 * The sentence the Summary display mode shows for a tool call the model gave
 * no intent for: what kind of step it is and what it works on, never the
 * tool's raw arguments.
 */
export function summaryLabel(tool: IndividualToolCallDisplay): string {
  const mcp = MCP_DISPLAY_NAME.exec(tool.name);
  if (mcp) {
    return t('Using {{server}}/{{tool}}', { server: mcp[2], tool: mcp[1] });
  }
  const target = summaryTarget(tool);
  switch (getToolCategory(tool.name)) {
    case 'read':
      return target ? t('Reading {{target}}', { target }) : t('Reading files');
    case 'edit':
      return target
        ? t('Changing {{target}}', { target })
        : t('Changing files');
    case 'write':
      return target ? t('Writing {{target}}', { target }) : t('Writing files');
    case 'list':
      return target ? t('Listing {{target}}', { target }) : t('Listing files');
    case 'search': {
      const query = stringArg(tool, QUERY_ARGS);
      return query
        ? t('Searching "{{query}}"', { query: oneLine(query) })
        : t('Searching the project');
    }
    case 'command': {
      const command = stringArg(tool, ['command']) ?? tool.description;
      const program = command ? commandProgram(command) : '';
      return program
        ? t('Running {{program}}', { program })
        : t('Running a command');
    }
    case 'agent':
      return t('Delegating to an agent');
    default:
      return localizeToolDisplayName(tool.name);
  }
}
