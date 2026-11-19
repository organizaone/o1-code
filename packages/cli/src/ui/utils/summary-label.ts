/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import stripAnsi from 'strip-ansi';
import {
  ToolDisplayNames,
  ToolNames,
} from '@organizaone/o1-code-core/tools/tool-names.js';
import { t, localizeToolDisplayName } from '../../i18n/index.js';
import type { IndividualToolCallDisplay } from '../types.js';
import { getToolCategory } from '../components/messages/CompactToolGroupDisplay.js';
import { sanitizeTerminalText } from './textUtils.js';

const MCP_DISPLAY_NAME = /^(.+) \((.+) MCP Server\)$/;
const MCP_RAW_NAME = /^mcp__(.+?)__(.+)$/;

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

// "npm run build": the script is the action, so the label keeps it too.
const SCRIPT_RUNNERS = new Set(['bun', 'npm', 'pnpm', 'yarn']);

// Segments that prepare or decorate a step without being it.
const SETUP_PROGRAMS = new Set([
  ':',
  'cd',
  'chcp',
  'echo',
  'export',
  'popd',
  'printf',
  'pushd',
  'set',
  'set-location',
  'sleep',
  'source',
  'true',
  'write-host',
  'write-output',
]);

// Words in front of the program that run it rather than being it.
const PREFIX_PROGRAMS = new Set([
  '!',
  '&',
  '(',
  '{',
  'command',
  'do',
  'else',
  'env',
  'exec',
  'if',
  'nohup',
  'setsid',
  'sudo',
  'then',
  'time',
  'try',
  'until',
  'while',
]);

// A program is a name or a path; a variable, a literal, a test or a
// redirection in its place names no step, and neither does shell syntax.
const PROGRAM_START = /^[A-Za-z_.~/\\]/;
const SHELL_SYNTAX = /^(for|test|done|fi|esac)$/;
const REDIRECTION = /^\d*[<>]/;

// Programs that run another command line, given as their script argument.
const SHELL_PROGRAMS = new Set([
  'bash',
  'cmd',
  'powershell',
  'pwsh',
  'sh',
  'wsl',
  'zsh',
]);

const SCRIPT_FLAG = /^(-c|-lc|-ic|-command|-e|--exec|--|\/c|\/k)$/i;
const FILE_FLAG = /^(-f|-file)$/i;
const VALUE_FLAG =
  /^(-d|--distribution|-u|--user|--cd|-executionpolicy|-ep|-workingdirectory|-wd)$/i;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const EXECUTABLE_SUFFIX = /\.(exe|cmd|bat)$/i;
const MAX_UNWRAP_DEPTH = 3;

const PATH_ARGS = ['file_path', 'absolute_path', 'path', 'notebook_path'];
const QUERY_ARGS = ['pattern', 'query'];

/** The longest step description a row shows, as for the model's intent. */
const DESCRIPTION_MAX_LENGTH = 120;

/** One line of terminal-safe text, with escape sequences removed. */
export function oneLine(value: string): string {
  return sanitizeTerminalText(stripAnsi(value)).replace(/\s+/g, ' ').trim();
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

/** Splits a command line on `&&`, `||`, `;`, `|` and line breaks outside quotes. */
function splitSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote = '';
  let substitution = 0;
  for (let i = 0; i < command.length; i++) {
    const char = command[i]!;
    if (quote) {
      if (char === quote) quote = '';
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    const pair = command.slice(i, i + 2);
    // `$( ... )` is one word of its segment, whatever it runs inside.
    if (pair === '$(') {
      substitution++;
      current += pair;
      i++;
      continue;
    }
    if (substitution > 0) {
      if (char === '(') substitution++;
      else if (char === ')') substitution--;
      current += char;
    } else if (pair === '&&' || pair === '||') {
      segments.push(current);
      current = '';
      i++;
    } else if (char === ';' || char === '|' || char === '\n') {
      segments.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  segments.push(current);
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

/** Splits a segment into words, a quoted string being one word without its quotes. */
function splitWords(segment: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote = '';
  let open = false;
  let substitution = 0;
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]!;
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (segment.slice(i, i + 2) === '$(') {
      substitution++;
      current += '$(';
      i++;
      continue;
    }
    if (substitution > 0) {
      if (char === '(') substitution++;
      else if (char === ')') substitution--;
      current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      open = true;
    } else if (/\s/.test(char)) {
      if (open || current) words.push(current);
      current = '';
      open = false;
    } else {
      current += char;
    }
  }
  if (open || current) words.push(current);
  return words;
}

function programName(word: string): string {
  const name = word.split(/[\\/]/).pop() ?? word;
  return name.replace(EXECUTABLE_SUFFIX, '');
}

interface CommandStep {
  /** The program that does the work, with its subcommand when it has one. */
  program: string;
  /** The directory a leading `cd` moved to. */
  directory?: string;
  /** No segment did more than prepare: the program is the first one found. */
  setupOnly: boolean;
}

function segmentStep(words: string[], depth: number): CommandStep | undefined {
  let index = 0;
  let afterPrefix = false;
  for (; index < words.length; index++) {
    const word = words[index]!;
    if (PREFIX_PROGRAMS.has(word.toLowerCase())) afterPrefix = true;
    else if (ENV_ASSIGNMENT.test(word)) afterPrefix = false;
    // A prefix's own flags ("sudo -n", "command -v") are not the program.
    else if (!(afterPrefix && word.startsWith('-'))) break;
  }
  // "(Get-Item x).Name": the call inside the parentheses is the program.
  const word = words[index];
  const first = word?.startsWith('(')
    ? word.replace(/^\(+/, '').split(/\s/)[0]
    : word;
  if (!first || !PROGRAM_START.test(first) || SHELL_SYNTAX.test(first)) {
    return undefined;
  }
  const program = programName(first);
  const lower = program.toLowerCase();
  const rest = words.slice(index + 1);

  if (SHELL_PROGRAMS.has(lower) && depth < MAX_UNWRAP_DEPTH) {
    for (let i = 0; i < rest.length; i++) {
      const word = rest[i]!;
      if (SCRIPT_FLAG.test(word)) {
        const script = rest.slice(i + 1);
        const inner =
          script.length === 1 ? script[0]! : script.map(requote).join(' ');
        return commandStepAt(inner, depth + 1) ?? step(program);
      }
      if (FILE_FLAG.test(word) && rest[i + 1]) {
        return step(programName(rest[i + 1]!));
      }
      if (VALUE_FLAG.test(word)) {
        i++;
      } else if (!word.startsWith('-') && !REDIRECTION.test(word)) {
        const inner =
          i === rest.length - 1 && /\s/.test(word)
            ? word
            : rest.slice(i).map(requote).join(' ');
        return commandStepAt(inner, depth + 1) ?? step(program);
      }
    }
    return step(program);
  }

  const next = rest[0];
  if (next && SUBCOMMAND_PROGRAMS.has(program) && /^[a-z][\w:-]*$/.test(next)) {
    const script = rest[1];
    if (
      next === 'run' &&
      SCRIPT_RUNNERS.has(program) &&
      script &&
      /^[\w:.-]+$/.test(script)
    ) {
      return step(`${program} run ${script}`);
    }
    return step(`${program} ${next}`);
  }
  return step(program, SETUP_PROGRAMS.has(lower));
}

function step(program: string, setupOnly = false): CommandStep {
  return { program, setupOnly };
}

function requote(word: string): string {
  if (word !== '' && !/\s/.test(word)) return word;
  const quote = word.includes('"') ? "'" : '"';
  return `${quote}${word}${quote}`;
}

function commandStepAt(
  command: string,
  depth: number,
): CommandStep | undefined {
  let directory: string | undefined;
  let fallback: CommandStep | undefined;
  for (const segment of splitSegments(command)) {
    const words = splitWords(segment);
    const found = segmentStep(words, depth);
    if (!found) continue;
    if (!found.setupOnly) {
      return { ...found, directory: found.directory ?? directory };
    }
    fallback ??= found;
    const lower = found.program.toLowerCase();
    if (
      (lower === 'cd' || lower === 'pushd' || lower === 'set-location') &&
      words.length > 1
    ) {
      directory = words[words.length - 1];
    }
  }
  return fallback;
}

/**
 * What a shell command does: the program of the first segment that is not
 * preparation (`cd`, `echo`, an environment assignment), looked for inside
 * `wsl`, `bash -c`, `powershell -Command` and the like.
 */
export function commandStep(command: string): CommandStep | undefined {
  const found = commandStepAt(stripAnsi(command), 0);
  if (!found) return undefined;
  const program = oneLine(found.program);
  return program ? { ...found, program } : undefined;
}

/** The program a shell command runs, plus its subcommand when it has one. */
export function commandProgram(command: string): string {
  return commandStep(command)?.program ?? '';
}

/** The last two names of a directory path: enough to place a step. */
function shortDirectory(directory: string | undefined): string | undefined {
  if (!directory) return undefined;
  const names = oneLine(directory)
    .split(/[\\/]/)
    .filter((name) => name && name !== '.' && name !== '~');
  if (names.length === 0 || names.every((name) => name === '..')) {
    return undefined;
  }
  return names.slice(-2).join('/');
}

function shellCommand(tool: IndividualToolCallDisplay): string | undefined {
  return stringArg(tool, ['command']) ?? (tool.description || undefined);
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(oneLine(url)).hostname.replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

const DISPLAY_NAME_BY_TOOL_NAME = new Map<string, string>(
  (Object.keys(ToolNames) as Array<keyof typeof ToolNames>).map((key) => [
    ToolNames[key],
    ToolDisplayNames[key],
  ]),
);

/** The call a `ToolCall` step runs, as a row of its own. */
function innerToolCall(
  tool: IndividualToolCallDisplay,
): IndividualToolCallDisplay | undefined {
  if (tool.name !== ToolDisplayNames.TOOL_CALL) return undefined;
  const name = stringArg(tool, ['name']);
  if (!name) return undefined;
  const args = tool.args?.['arguments'];
  const mcp = MCP_RAW_NAME.exec(name);
  return {
    ...tool,
    name: mcp
      ? `${mcp[2]} (${mcp[1]} MCP Server)`
      : (DISPLAY_NAME_BY_TOOL_NAME.get(name) ?? name),
    description: '',
    args:
      typeof args === 'object' && args !== null && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {},
  };
}

/**
 * The description the model already wrote for the step: every shell command
 * and agent call carries one, in the user's language.
 */
export function summaryDescription(
  tool: IndividualToolCallDisplay,
): string | undefined {
  const inner = innerToolCall(tool);
  if (inner) return summaryDescription(inner);
  const category = getToolCategory(tool.name);
  if (category !== 'command' && category !== 'agent') return undefined;
  const description = stringArg(tool, ['description']);
  if (!description) return undefined;
  return oneLine(description).slice(0, DESCRIPTION_MAX_LENGTH) || undefined;
}

/**
 * The one thing a step works on, shown beside a sentence that does not name
 * it: a file, a program, a host, a skill.
 */
export function summaryDetail(
  tool: IndividualToolCallDisplay,
): string | undefined {
  const inner = innerToolCall(tool);
  if (inner) return summaryDetail(inner);
  if (MCP_DISPLAY_NAME.test(tool.name)) return undefined;
  switch (getToolCategory(tool.name)) {
    case 'read':
    case 'edit':
    case 'write':
    case 'list':
      return summaryTarget(tool);
    case 'command': {
      const command = shellCommand(tool);
      return (command && commandProgram(command)) || undefined;
    }
    case 'agent': {
      const type = stringArg(tool, ['subagent_type']);
      return type ? oneLine(type) : undefined;
    }
    case 'search':
      return undefined;
    default:
      break;
  }
  if (tool.name === ToolDisplayNames.WEB_FETCH) {
    return hostOf(stringArg(tool, ['url']));
  }
  if (tool.name === ToolDisplayNames.SKILL) {
    const skill = stringArg(tool, ['skill']);
    return skill ? oneLine(skill) : undefined;
  }
  return undefined;
}

/**
 * The sentence the Summary display mode shows for a tool call the model gave
 * no intent for: what kind of step it is and what it works on, never the
 * tool's raw arguments.
 */
export function summaryLabel(tool: IndividualToolCallDisplay): string {
  const inner = innerToolCall(tool);
  if (inner) return summaryLabel(inner);
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
      if (!query) return t('Searching the project');
      const directory = shortDirectory(stringArg(tool, ['path']));
      return directory
        ? t('Searching "{{query}}" in {{directory}}', {
            query: oneLine(query),
            directory,
          })
        : t('Searching "{{query}}"', { query: oneLine(query) });
    }
    case 'command': {
      const command = shellCommand(tool);
      const found = command ? commandStep(command) : undefined;
      if (!found?.program) return t('Running a command');
      const directory = shortDirectory(
        stringArg(tool, ['directory']) ?? found.directory,
      );
      return directory
        ? t('Running {{program}} in {{directory}}', {
            program: found.program,
            directory,
          })
        : t('Running {{program}}', { program: found.program });
    }
    case 'agent':
      return t('Delegating to an agent');
    default:
      break;
  }
  if (tool.name === ToolDisplayNames.WEB_FETCH) {
    const host = hostOf(stringArg(tool, ['url']));
    if (host) return t('Fetching {{host}}', { host });
  }
  if (tool.name === ToolDisplayNames.WEB_SEARCH) {
    const query = stringArg(tool, ['query']);
    if (query) {
      return t('Searching the web for "{{query}}"', { query: oneLine(query) });
    }
  }
  if (tool.name === ToolDisplayNames.SKILL) {
    const skill = stringArg(tool, ['skill']);
    if (skill) return t('Using the {{skill}} skill', { skill: oneLine(skill) });
  }
  if (tool.name === ToolDisplayNames.TOOL_SEARCH) {
    const query = stringArg(tool, ['query']);
    if (query) {
      return t('Looking for a tool: {{query}}', { query: oneLine(query) });
    }
  }
  return localizeToolDisplayName(tool.name);
}
