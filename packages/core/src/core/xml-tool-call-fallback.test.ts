/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { Lexer } from 'marked';

const OPEN = '<' + 'invoke';
const CLOSE = '</' + 'invoke>';
const PARAM_OPEN = '<' + 'parameter';
const PARAM_CLOSE = '</' + 'parameter>';

function invoke(name: string, params: string): string {
  return `${OPEN} name="${name}">${params}${CLOSE}`;
}

function param(name: string, value: string): string {
  return `${PARAM_OPEN} name="${name}">${value}${PARAM_CLOSE}`;
}

import {
  containsXmlToolCalls,
  coerceXmlToolCallArguments,
  extractXmlToolCalls,
  tryRecoverXmlToolCalls,
  XmlToolCallTextBuffer,
} from './xml-tool-call-fallback.js';

describe('function/parameter XML dialect', () => {
  const xml =
    '<tool_call><function=read_file><parameter=file_path>W:\\workspace\\test.py</parameter><parameter=offset>44</parameter><parameter=limit>80</parameter></function></tool_call>';

  it('recovers the reported Windows path and strips the complete wrapper', () => {
    const result = tryRecoverXmlToolCalls(xml);
    expect(result.recovered).toBe(true);
    expect(result.remainingText).toBe('');
    expect(result.functionCallParts[0]?.functionCall?.args).toEqual({
      file_path: 'W:\\workspace\\test.py',
      offset: '44',
      limit: '80',
    });
  });

  it('does not recover mismatched closing tags', () => {
    expect(
      tryRecoverXmlToolCalls(
        '<tool_call><function=read_file><parameter=file_path>a.ts</parameter></invoke>',
      ).recovered,
    ).toBe(false);
    expect(
      tryRecoverXmlToolCalls(
        '<invoke name="read_file"><parameter name="file_path">a.ts</parameter></function></tool_call>',
      ).recovered,
    ).toBe(false);
  });

  it('coerces scalar arguments only according to the declared schema', () => {
    const args = {
      file_path: '123',
      offset: '44',
      limit: '80',
      enabled: 'true',
      invalid: '1.5',
    };
    coerceXmlToolCallArguments(args, {
      properties: {
        file_path: { type: 'string' },
        offset: { type: 'integer' },
        limit: { type: 'number' },
        enabled: { type: 'boolean' },
        invalid: { type: 'integer' },
      },
    });
    expect(args).toEqual({
      file_path: '123',
      offset: 44,
      limit: 80,
      enabled: true,
      invalid: '1.5',
    });
  });

  it('holds tags split at every character boundary without holding preceding prose', () => {
    for (let split = 1; split < xml.length; split++) {
      const buffer = new XmlToolCallTextBuffer();
      expect(buffer.accept('Reading now.\n' + xml.slice(0, split))).toBe(
        'Reading now.\n',
      );
      expect(buffer.accept(xml.slice(split))).toBe('');
      expect(buffer.remainingText).toBe(xml);
    }
  });

  it('preserves fenced examples and ordinary angle brackets', () => {
    const buffer = new XmlToolCallTextBuffer();
    expect(buffer.accept('```xml\n' + xml + '\n```')).toBe(
      '```xml\n' + xml + '\n```',
    );
    expect(buffer.accept('\nUse <')).toBe('\nUse ');
    expect(buffer.accept('div>.')).toBe('<div>.');
  });

  it('preserves trailing prose after normalization of already emitted newlines', () => {
    const buffer = new XmlToolCallTextBuffer();
    expect(buffer.accept('Before\n\n\n' + xml + 'After')).toBe('Before\n\n\n');
    expect(buffer.remainingRecoveredText()).toBe('After');
  });

  it('holds the invoke envelope as well as its calls', () => {
    const buffer = new XmlToolCallTextBuffer();
    expect(
      buffer.accept(
        '<function_calls>' +
          invoke('read_file', param('file_path', 'a.ts')) +
          '</function_calls>After',
      ),
    ).toBe('');
    expect(buffer.remainingRecoveredText()).toBe('After');
  });
});

describe('containsXmlToolCalls', () => {
  it('detects an invoke block', () => {
    expect(containsXmlToolCalls(invoke('read_file', param('p', 'v')))).toBe(
      true,
    );
  });

  it('returns false for plain text', () => {
    expect(containsXmlToolCalls('just some text')).toBe(false);
  });

  it('is stable across repeated calls (no lastIndex leak)', () => {
    const text = invoke('read_file', param('p', 'v'));
    expect(containsXmlToolCalls(text)).toBe(true);
    expect(containsXmlToolCalls(text)).toBe(true);
    expect(containsXmlToolCalls(text)).toBe(true);
  });
});

describe('extractXmlToolCalls', () => {
  it('extracts a single tool call', () => {
    const text = invoke('read_file', param('file_path', 'a.ts'));
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'read_file', args: { file_path: 'a.ts' } },
    ]);
  });

  it('extracts multiple tool calls', () => {
    const text =
      invoke('read_file', param('file_path', 'a.ts')) +
      '\n' +
      invoke('run_shell_command', param('command', 'ls'));
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'read_file', args: { file_path: 'a.ts' } },
      { name: 'run_shell_command', args: { command: 'ls' } },
    ]);
  });

  it('extracts multiple parameters for one call', () => {
    const text = invoke(
      'edit',
      param('file_path', 'a.ts') + param('old_string', 'x'),
    );
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'edit', args: { file_path: 'a.ts', old_string: 'x' } },
    ]);
  });

  it('skips invoke blocks without parameters (conservative)', () => {
    const text = invoke('no_params', 'some body but no parameters');
    expect(extractXmlToolCalls(text)).toEqual([]);
  });

  it('parses structured JSON but preserves scalar strings', () => {
    const text = invoke(
      'tool',
      param('count', '3') +
        param('flag', 'true') +
        param('opts', '{"a": 1}') +
        param('list', '[1, 2]') +
        param('plain', 'hello world') +
        param('nil', 'null'),
    );
    expect(extractXmlToolCalls(text)).toEqual([
      {
        name: 'tool',
        args: {
          count: '3',
          flag: 'true',
          opts: { a: 1 },
          list: [1, 2],
          plain: 'hello world',
          nil: 'null',
        },
      },
    ]);
  });

  it('preserves raw string for malformed JSON values', () => {
    const text = invoke(
      'tool',
      param('data', '{not valid json') + param('ok', 'yes'),
    );
    expect(extractXmlToolCalls(text)).toEqual([
      {
        name: 'tool',
        args: { data: '{not valid json', ok: 'yes' },
      },
    ]);
  });

  it('extracts tool calls with multi-line parameter values', () => {
    const text = invoke(
      'edit',
      param('file_path', '/some/path/file.tsx') +
        param('old_string', 'line1,\nline2,\nline3,'),
    );
    expect(extractXmlToolCalls(text)).toEqual([
      {
        name: 'edit',
        args: {
          file_path: '/some/path/file.tsx',
          old_string: 'line1,\nline2,\nline3,',
        },
      },
    ]);
  });

  it('strips only delimiting newlines, preserving significant whitespace', () => {
    const text = invoke('edit', param('old_string', '\n    return null;\n'));
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'edit', args: { old_string: '    return null;' } },
    ]);
  });

  it('does not crash on malformed or nested XML', () => {
    expect(extractXmlToolCalls('<invoke name="x"><invoke')).toEqual([]);
    expect(extractXmlToolCalls('</invoke><invoke>')).toEqual([]);
    expect(
      extractXmlToolCalls(invoke('outer', invoke('inner', param('p', 'v')))),
    ).toBeInstanceOf(Array);
  });

  it('returns consistent results across repeated calls (no lastIndex leak)', () => {
    const text = invoke('read_file', param('p', 'v'));
    const first = extractXmlToolCalls(text);
    const second = extractXmlToolCalls(text);
    expect(second).toEqual(first);
    expect(second).toHaveLength(1);
  });

  it('is safe against __proto__ parameter names', () => {
    const text = invoke(
      'tool',
      param('__proto__', '{"polluted": true}') + param('safe', 'yes'),
    );
    const result = extractXmlToolCalls(text);
    expect(result).toHaveLength(1);
    const args = result[0]!.args;
    expect(args['safe']).toBe('yes');
    expect(Object.getPrototypeOf(args)).toBeNull();
    expect((args as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('skips invoke blocks inside fenced code blocks', () => {
    const text =
      '```xml\n' +
      invoke('run_shell_command', param('command', 'rm -rf /tmp/x')) +
      '\n```';
    expect(extractXmlToolCalls(text)).toEqual([]);
  });

  it('extracts non-fenced invokes while skipping fenced ones', () => {
    const realCall = invoke('read_file', param('file_path', 'a.ts'));
    const fencedExample =
      '```xml\n' +
      invoke('run_shell_command', param('command', 'echo hello')) +
      '\n```';
    const text = realCall + '\n' + fencedExample;
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'read_file', args: { file_path: 'a.ts' } },
    ]);
  });

  it('skips invokes inside a ~~~ fence that contains ``` lines', () => {
    const text =
      '~~~markdown\n' +
      'Here is an example:\n' +
      '```xml\n' +
      invoke('run_shell_command', param('command', 'echo hello')) +
      '\n```\n' +
      '~~~';
    expect(extractXmlToolCalls(text)).toEqual([]);
  });

  it('treats a shorter same-delimiter fence as content, not a close (CommonMark 4.5)', () => {
    const text =
      '````markdown\n' +
      '```xml\n' +
      invoke('run_shell_command', param('command', 'rm -rf /tmp/x')) +
      '\n```\n' +
      '````';
    expect(extractXmlToolCalls(text)).toEqual([]);
  });

  it('treats a closing fence with an info string as content, not a close (CommonMark 4.5)', () => {
    const text =
      '````markdown\n' +
      '```xml\n' +
      invoke('run_shell_command', param('command', 'rm -rf /tmp/x')) +
      '\n```xml\n' +
      '````';
    expect(extractXmlToolCalls(text)).toEqual([]);
  });

  it('treats a closing fence with trailing text as content, not a close', () => {
    const text =
      '~~~markdown\n' +
      invoke('run_shell_command', param('command', 'echo hi')) +
      '\n~~~ end of examples\n' +
      '~~~';
    expect(extractXmlToolCalls(text)).toEqual([]);
  });

  it('extracts a later invoke when an earlier parameter contains an unclosed fence', () => {
    const editWithFence = invoke(
      'edit',
      param('file_path', 'docs.md') +
        param('old_string', '```ts\nconst x = 1;'),
    );
    const readCall = invoke('read_file', param('file_path', 'a.ts'));
    const text = editWithFence + '\n' + readCall;
    expect(extractXmlToolCalls(text)).toEqual([
      {
        name: 'edit',
        args: { file_path: 'docs.md', old_string: '```ts\nconst x = 1;' },
      },
      { name: 'read_file', args: { file_path: 'a.ts' } },
    ]);
  });

  it('extracts a later invoke when an earlier parameter contains a closed fence pair', () => {
    const editWithFence = invoke('edit', param('old_string', '```\ncode\n```'));
    const readCall = invoke('read_file', param('file_path', 'b.ts'));
    const text = editWithFence + '\n' + readCall;
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'edit', args: { old_string: '```\ncode\n```' } },
      { name: 'read_file', args: { file_path: 'b.ts' } },
    ]);
  });

  it('still skips invokes inside a prose fence when parameters also contain fences', () => {
    const text =
      '```markdown\n' +
      invoke('edit', param('old_string', '```\ninner\n```')) +
      '\n```\n' +
      invoke('read_file', param('file_path', 'c.ts'));
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'read_file', args: { file_path: 'c.ts' } },
    ]);
  });

  it('decodes XML entities in parameter values', () => {
    const text = invoke(
      'edit',
      param('old_string', 'if (a &lt; b) &amp;&amp; c &gt; d') +
        param('new_string', 'x &apos;y&apos; &quot;z&quot;'),
    );
    expect(extractXmlToolCalls(text)).toEqual([
      {
        name: 'edit',
        args: {
          old_string: 'if (a < b) && c > d',
          new_string: 'x \'y\' "z"',
        },
      },
    ]);
  });

  it('decodes &amp; last so &amp;lt; becomes literal &lt;', () => {
    const text = invoke('tool', param('v', '&amp;lt;'));
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'tool', args: { v: '&lt;' } },
    ]);
  });

  it('leaves values without entities unchanged', () => {
    const text = invoke('tool', param('v', 'plain text'));
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'tool', args: { v: 'plain text' } },
    ]);
  });

  it('supports single-quoted attribute values', () => {
    const text =
      "<invoke name='read_file'><parameter name='file_path'>a.ts</parameter></invoke>";
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'read_file', args: { file_path: 'a.ts' } },
    ]);
  });
});

describe('tryRecoverXmlToolCalls', () => {
  it('reports no recovery when there are no tool calls', () => {
    const result = tryRecoverXmlToolCalls('plain text only');
    expect(result.recovered).toBe(false);
    expect(result.functionCallParts).toEqual([]);
    expect(result.remainingText).toBe('plain text only');
  });

  it('recovers functionCall parts from XML content', () => {
    const result = tryRecoverXmlToolCalls(
      invoke('read_file', param('file_path', 'a.ts')),
    );
    expect(result.recovered).toBe(true);
    expect(result.functionCallParts).toHaveLength(1);
    const call = result.functionCallParts[0]?.functionCall;
    expect(call?.name).toBe('read_file');
    expect(call?.args).toEqual({ file_path: 'a.ts' });
    expect(call?.id).toMatch(/^xml-recovered-/);
  });

  it('preserves short surrounding text in remainingText', () => {
    const text = 'Sure.\n' + invoke('read_file', param('file_path', 'a.ts'));
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(true);
    expect(result.remainingText).toBe('Sure.');
  });

  it('returns empty remainingText when the content is only XML', () => {
    const result = tryRecoverXmlToolCalls(
      invoke('read_file', param('file_path', 'a.ts')),
    );
    expect(result.recovered).toBe(true);
    expect(result.remainingText).toBe('');
  });

  it('does not recover when substantial prose surrounds the XML', () => {
    const prose =
      'Here is how you use the tool. First you open the file, then you read it. ' +
      'The invoke block below shows the format. Remember to always check the path. ' +
      'This is a documentation example for the read_file tool call format. ' +
      'You should never execute these examples directly. They are for illustration ' +
      'purposes only. The actual tool calls are made through the structured API.';
    const text = prose + '\n' + invoke('read_file', param('file_path', 'a.ts'));
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(false);
    expect(result.functionCallParts).toEqual([]);
  });

  it('recovers when reasoning prose precedes the XML', () => {
    // Reconstructs the reported shape: ~1400 chars of model reasoning
    // prose followed by a ~600-byte edit invoke with multi-line params.
    // Prose ratio ≈ 0.70, which must pass the 0.8 guard.
    const reasoning =
      'I need to fix the authentication token validation in the middleware. ' +
      'The current implementation does not check the expiry date, which means ' +
      'expired tokens are still accepted. This is a security vulnerability that ' +
      'could allow unauthorized access. I will update the validateToken function ' +
      'to check the exp claim and reject tokens that have expired. The fix involves ' +
      'adding a date comparison after the signature verification step. I also need ' +
      'to make sure the error message is clear about why the token was rejected. ' +
      'Let me look at the current implementation and make the necessary changes. ' +
      'The file is located in the src/middleware directory. I will use the edit tool ' +
      'to replace the old validation logic with the new one that includes expiry ' +
      'checking. This should be a straightforward change that does not affect other ' +
      'parts of the codebase. The test suite should still pass after this change. ' +
      'I have verified that no other middleware depends on the old behavior. ' +
      'The change is backward compatible because valid tokens will still be accepted.';
    const editBlock = invoke(
      'edit',
      param('file_path', '/project/src/middleware/auth.ts') +
        param(
          'old_string',
          'function validateToken(token: string): boolean {\n' +
            '  const decoded = jwt.verify(token, SECRET);\n' +
            '  return decoded !== null;\n' +
            '}',
        ) +
        param(
          'new_string',
          'function validateToken(token: string): boolean {\n' +
            '  const decoded = jwt.verify(token, SECRET);\n' +
            '  if (!decoded || !decoded.exp) return false;\n' +
            '  return Date.now() < decoded.exp * 1000;\n' +
            '}',
        ),
    );
    const text = reasoning + '\n' + editBlock;
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(true);
    expect(result.functionCallParts).toHaveLength(1);
    const call = result.functionCallParts[0]?.functionCall;
    expect(call?.name).toBe('edit');
    expect(call?.args).toHaveProperty('file_path');
    expect(call?.args).toHaveProperty('old_string');
    expect(call?.args).toHaveProperty('new_string');
    expect(result.remainingText).toBe(reasoning);
  });

  it('preserves parameterless invoke blocks as plain text', () => {
    const parameterless = invoke('think', 'Let me reason about this problem');
    const parameterized = invoke('read_file', param('file_path', 'a.ts'));
    const text = parameterized + '\n' + parameterless;
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(true);
    expect(result.functionCallParts).toHaveLength(1);
    expect(result.remainingText).toContain(parameterless);
  });

  it('does not recover an invoke example inside a fenced code block', () => {
    const text =
      '```xml\n' +
      invoke('run_shell_command', param('command', 'rm -rf /tmp/x')) +
      '\n```';
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(false);
    expect(result.functionCallParts).toEqual([]);
    expect(result.remainingText).toBe(text);
  });

  it('recovers a real invoke while excluding a fenced example after it', () => {
    const realCall = invoke('read_file', param('file_path', 'a.ts'));
    const fencedExample =
      '```xml\n' +
      invoke('run_shell_command', param('command', 'echo hello')) +
      '\n```';
    const text = realCall + '\n' + fencedExample;
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(true);
    expect(result.functionCallParts).toHaveLength(1);
    const call = result.functionCallParts[0]?.functionCall;
    expect(call?.name).toBe('read_file');
    expect(call?.args).toEqual({ file_path: 'a.ts' });
    expect(result.remainingText).toContain('```xml');
    expect(result.remainingText).toContain('echo hello');
  });

  it('does not recover an invoke inside a ~~~ fence containing ``` lines', () => {
    const text =
      '~~~markdown\n' +
      'Example:\n' +
      '```xml\n' +
      invoke('run_shell_command', param('command', 'echo hi')) +
      '\n```\n' +
      '~~~';
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(false);
    expect(result.functionCallParts).toEqual([]);
    expect(result.remainingText).toBe(text);
  });

  it('does not recover an invoke nested in a longer same-delimiter fence', () => {
    const text =
      '````markdown\n' +
      '```xml\n' +
      invoke('run_shell_command', param('command', 'rm -rf /tmp/x')) +
      '\n```\n' +
      '````';
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(false);
    expect(result.functionCallParts).toEqual([]);
    expect(result.remainingText).toBe(text);
  });

  it('does not recover an invoke when the closing fence carries an info string', () => {
    const text =
      '````markdown\n' +
      '```xml\n' +
      invoke('run_shell_command', param('command', 'rm -rf /tmp/x')) +
      '\n```xml\n' +
      '````';
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(false);
    expect(result.functionCallParts).toEqual([]);
    expect(result.remainingText).toBe(text);
  });

  it('does not recover an invoke when the closing fence has trailing text', () => {
    const text =
      '~~~markdown\n' +
      invoke('run_shell_command', param('command', 'echo hi')) +
      '\n~~~ end of examples\n' +
      '~~~';
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(false);
    expect(result.functionCallParts).toEqual([]);
    expect(result.remainingText).toBe(text);
  });

  it('recovers both invokes when the first has a fence-like parameter value', () => {
    const editWithFence = invoke(
      'edit',
      param('old_string', '```\nunclosed fence'),
    );
    const readCall = invoke('read_file', param('file_path', 'a.ts'));
    const text = editWithFence + '\n' + readCall;
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(true);
    expect(result.functionCallParts).toHaveLength(2);
    expect(result.functionCallParts[0]?.functionCall?.name).toBe('edit');
    expect(result.functionCallParts[1]?.functionCall?.name).toBe('read_file');
  });

  it('strips an empty function_calls wrapper from remainingText', () => {
    const text =
      '<function_calls>\n' +
      invoke('read_file', param('file_path', 'a.ts')) +
      '\n<' +
      '/function_calls>';
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(true);
    expect(result.remainingText).toBe('');
  });
});

const FN_CLOSE = '</' + 'function>';

function fn(name: string, params: string): string {
  return `<tool_call><function=${name}>${params}${FN_CLOSE}</tool_call>`;
}

function flat(name: string, value: string): string {
  return `${PARAM_OPEN}=${name}>${value}${PARAM_CLOSE}`;
}

function names(text: string): string[] {
  return extractXmlToolCalls(text).map(({ name }) => name);
}

function expectInert(text: string): void {
  expect(extractXmlToolCalls(text)).toEqual([]);
  expect(tryRecoverXmlToolCalls(text)).toEqual({
    recovered: false,
    functionCallParts: [],
    remainingText: text,
  });
}

const SHELL = invoke('run_shell_command', param('command', 'rm -rf /tmp/x'));
const READ = invoke('read_file', param('file_path', 'real.ts'));
const READ_CALL = { name: 'read_file', args: { file_path: 'real.ts' } };

describe('calls quoted inside a parameter value', () => {
  it('recovers the outer call once with its complete content', () => {
    const text = invoke(
      'write_file',
      param('file_path', 'doc.md') + param('content', `Usage:\n${SHELL}\n`),
    );
    const expected = {
      name: 'write_file',
      args: { file_path: 'doc.md', content: `Usage:\n${SHELL}` },
    };
    expect(extractXmlToolCalls(text)).toEqual([expected]);
    const result = tryRecoverXmlToolCalls(text);
    expect(result.recovered).toBe(true);
    expect(result.functionCallParts.map((part) => part.functionCall)).toEqual([
      expect.objectContaining(expected),
    ]);
    expect(result.remainingText).toBe('');
  });

  it('recovers the same shape in the function dialect', () => {
    const quoted = fn('read_file', flat('file_path', 'x.txt'));
    const content = `Usage:\n${quoted}\ntail`;
    const text = fn(
      'write_file',
      flat('file_path', 'doc.md') + flat('content', content),
    );
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'write_file', args: { file_path: 'doc.md', content } },
    ]);
    expect(tryRecoverXmlToolCalls(text).remainingText).toBe('');
  });

  it('still dispatches a real call that follows a value quoting one', () => {
    const documented = invoke(
      'write_file',
      param('content', `Usage:\n${SHELL}\n`),
    );
    expect(extractXmlToolCalls(`${documented}\n${READ}`)).toEqual([
      { name: 'write_file', args: { content: `Usage:\n${SHELL}` } },
      READ_CALL,
    ]);
  });

  it('recovers a trailing parameter behind a quoted value', () => {
    const text = invoke(
      'write_file',
      param('content', `Usage:\n${READ}\n`) + param('file_path', 'doc.md'),
    );
    expect(extractXmlToolCalls(text)).toEqual([
      {
        name: 'write_file',
        args: { content: `Usage:\n${READ}`, file_path: 'doc.md' },
      },
    ]);
    expect(tryRecoverXmlToolCalls(text).remainingText).toBe('');
  });

  it('steps past two quoted values in one block', () => {
    const text = invoke(
      'write_file',
      param('content', `Usage:\n${READ}\n`) + param('note', `Also:\n${READ}\n`),
    );
    expect(extractXmlToolCalls(text)).toEqual([
      {
        name: 'write_file',
        args: { content: `Usage:\n${READ}`, note: `Also:\n${READ}` },
      },
    ]);
    expect(tryRecoverXmlToolCalls(text).remainingText).toBe('');
  });

  it('recovers a complete value that documents a parameter element', () => {
    const content = `Wrap each argument in ${param('x', 'y')} tags.`;
    const write = invoke(
      'write_file',
      param('file_path', 'doc.md') + param('content', content),
    );
    expect(extractXmlToolCalls(write)).toEqual([
      { name: 'write_file', args: { file_path: 'doc.md', content } },
    ]);
  });

  it('recovers a value that mentions an open tag, and its sibling', () => {
    const content = `Each argument is wrapped in ${PARAM_OPEN} name="x"> tags.`;
    const write = invoke(
      'write_file',
      param('file_path', 'a.txt') + param('content', content),
    );
    expect(extractXmlToolCalls(`${write}\n${READ}`)).toEqual([
      { name: 'write_file', args: { file_path: 'a.txt', content } },
      READ_CALL,
    ]);
  });

  it('does not bind the block to a closer the following prose mentions', () => {
    const withTrailingParameter = invoke(
      'write_file',
      param('content', `Usage:\n${READ}\n`) +
        `\nEscape ${CLOSE} in docs.\n` +
        param('file_path', 'doc.md'),
    );
    expectInert(withTrailingParameter);
    const proseOnly = invoke(
      'write_file',
      param('content', `Usage:\n${READ}\n`) + `\nNote: escape ${CLOSE} here.`,
    );
    expectInert(proseOnly);
  });

  it('does not bind a function-dialect block to a mentioned closer', () => {
    const quoted = fn('read_file', flat('file_path', 'x.txt'));
    const text = fn(
      'write_file',
      flat('content', `Well-formed:\n${quoted}\n`) +
        `\nEscape ${FN_CLOSE}</tool_call> in docs.\n` +
        flat('file_path', 'doc.md'),
    );
    expectInert(text);
  });

  it('rejects a block whose parameter names repeat', () => {
    const text =
      `${OPEN} name="run_shell_command">` +
      param('command', 'echo safe') +
      param('note', invoke('x', param('p', 'v'))) +
      '\n    ' +
      param('command', 'rm -rf /tmp/x') +
      `\n${CLOSE}`;
    expectInert(text);
  });

  it('does not dispatch a value truncated at a bare closing tag', () => {
    const text =
      `${OPEN} name="write_file">` +
      `${PARAM_OPEN} name="content">Usage:\n` +
      `${OPEN} name="run_shell_command">` +
      param('command', 'rm -rf /tmp/x') +
      param('note', `see ${OPEN} name="read_file">...${CLOSE}`) +
      `${CLOSE}\n` +
      param('stray', '') +
      CLOSE;
    expectInert(text);
    // The unclosed write stays inert, and so do the calls its value quotes.
    expect(names(`${text}\n${READ}`)).toEqual(['read_file']);
  });

  it('never dispatches a truncated value when a parameter name mixes quotes', () => {
    const text =
      `${OPEN} name="write_file">` +
      param('file_path', 'doc.md') +
      `${PARAM_OPEN} name='content">A' x>${invoke('a', param('p', 'v'))}${PARAM_CLOSE}` +
      CLOSE;
    expectInert(text);
  });

  it('does not excise a quoted value the block never consumed', () => {
    const text =
      `${OPEN} name="run_shell_command">` +
      `${PARAM_OPEN} name="command">run\n` +
      param('doc', `<function=b>${FN_CLOSE}`) +
      `\n${CLOSE}`;
    expectInert(text);
  });
});

describe('per-block rejection', () => {
  it('does not merge an unclosed block into the call that follows it', () => {
    const text =
      `${OPEN} name="write_file">` + param('file_path', 'a.ts') + `\n${READ}`;
    expect(extractXmlToolCalls(text)).toEqual([READ_CALL]);
  });

  it('recovers calls on both sides of an unclosed open tag in prose', () => {
    const before = invoke('read_file', param('file_path', 'a.ts'));
    const after = invoke('write_file', param('file_path', 'b.ts'));
    const text = `${before}\n${PARAM_OPEN} name="orphan">\n${after}`;
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'read_file', args: { file_path: 'a.ts' } },
      { name: 'write_file', args: { file_path: 'b.ts' } },
    ]);
  });

  it('treats parameter markup the grammar cannot parse as prose', () => {
    for (const token of [
      '<Parameter name="foo" />',
      `${PARAM_OPEN} foo="bar">`,
      `${PARAM_OPEN} name="foo" />`,
      PARAM_OPEN + '>',
    ]) {
      expect(extractXmlToolCalls(`${token}\n${READ}`)).toEqual([READ_CALL]);
    }
  });

  it('recovers a call whose value quotes non-canonical markup', () => {
    const value = `${PARAM_OPEN} foo="bar">`;
    expect(
      extractXmlToolCalls(invoke('read_file', param('file_path', value))),
    ).toEqual([{ name: 'read_file', args: { file_path: value } }]);
  });

  it('rejects a name with mixed quote characters, not its sibling', () => {
    const body = `\n${param('file_path', 'doc.md')}\n${param('content', 'body')}\n`;
    const mixed = `${OPEN} name='write_file">${body}${CLOSE}`;
    expectInert(mixed);
    expect(extractXmlToolCalls(`${mixed}\n${READ}`)).toEqual([READ_CALL]);
    expect(
      extractXmlToolCalls(`${OPEN} name='write_file'>${body}${CLOSE}`),
    ).toEqual([
      { name: 'write_file', args: { file_path: 'doc.md', content: 'body' } },
    ]);
  });

  it('rejects an odd-quote function name without cancelling its sibling', () => {
    const odd = fn("it's", param('command', 'ls'));
    expect(extractXmlToolCalls(`${odd}\n${READ}`)).toEqual([READ_CALL]);
  });

  it('does not rescan the body of a block whose open tag is untrustworthy', () => {
    for (const lead of ["it's", "it's > "]) {
      const text =
        `${OPEN} name='weird">\n` +
        `${PARAM_OPEN} name="p">${lead}` +
        invoke('rm', param('cmd', 'rm -rf /tmp/x')) +
        '\n\n';
      expect(extractXmlToolCalls(text)).toEqual([]);
    }
  });

  it('rejects only the untrustworthy block before a quoted-value advance', () => {
    const text =
      `${OPEN} name='weird">` +
      param('content', invoke('doc', param('p', 'v'))) +
      '\n' +
      fn('real', flat('q', 'w'));
    expect(extractXmlToolCalls(text)).toEqual([
      { name: 'real', args: { q: 'w' } },
    ]);
  });

  it('recovers the genuine call in a markup-only turn with a stray opener', () => {
    const text =
      `${OPEN} name="a">` +
      Array.from({ length: 16 }, (_, index) =>
        param(`p${index}`, `v${index}`),
      ).join(' ') +
      ' ' +
      invoke('read_file', param('file_path', 'a.ts'));
    expect(names(text)).toEqual(['read_file']);
    const result = tryRecoverXmlToolCalls(text);
    expect(
      result.functionCallParts.map((part) => part.functionCall?.name),
    ).toEqual(['read_file']);
    expect(result.remainingText).toContain(`${OPEN} name="a">`);
  });
});

describe('documentation regions', () => {
  it('does not dispatch a call documented in an HTML comment', () => {
    const text =
      'Docs:\n\n<!--\n' +
      invoke('run_shell_command', param('command', `${SHELL} rm -rf /tmp/x`)) +
      '\n-->\n\nend.';
    expectInert(text);
  });

  it('does not dispatch a call whose tail a comment opener inside it masks', () => {
    const text =
      'Docs:\n\n' +
      invoke(
        'run_shell_command',
        param('command', 'rm -rf /tmp/x') + '\n<!--',
      ) +
      '\n-->';
    expectInert(text);
  });

  it('still extracts a live call that follows a commented-out one', () => {
    const text = `Docs:\n\n<!--\n${SHELL}\n-->\n\n${READ}`;
    expect(extractXmlToolCalls(text)).toEqual([READ_CALL]);
  });

  it('ignores a prose mention of the comment opener', () => {
    const text = 'Use `<!--` to start an HTML comment, like this:\n\n' + READ;
    expect(extractXmlToolCalls(text)).toEqual([READ_CALL]);
  });

  it('does not let a comment opener inside a fence mask the rest of the turn', () => {
    expect(extractXmlToolCalls('```md\n<!--\n```\n\n' + READ)).toEqual([
      READ_CALL,
    ]);
  });

  it('closes an abrupt empty comment instead of masking the turn', () => {
    for (const opener of ['<!-->', '<!--->']) {
      expect(extractXmlToolCalls(`${opener}\n\n${READ}`)).toEqual([READ_CALL]);
    }
  });

  it('does not let an unclosed comment in a value hide a sibling call', () => {
    const content = '<body>\n<!-- footer goes here\n</body>';
    const write = invoke(
      'write_file',
      param('file_path', 'a.html') + param('content', content),
    );
    expect(extractXmlToolCalls(`${write}\n${READ}`)).toEqual([
      { name: 'write_file', args: { file_path: 'a.html', content } },
      READ_CALL,
    ]);
  });

  it('does not let a comment opener in a truncated value hide a sibling call', () => {
    const truncated =
      `${OPEN} name="write_file">` +
      `${PARAM_OPEN} name="content">` +
      '<body>\n<!-- footer goes here\n</body>';
    expect(extractXmlToolCalls(`${truncated}\n${READ}`)).toEqual([READ_CALL]);
  });

  it('does not end a comment at a terminator inside a value', () => {
    const closed =
      'Docs:\n\n<!--\n' + invoke('a', param('p', 'x --> y')) + `\n${SHELL}`;
    expectInert(`${closed}\n-->\n\nend.`);
    expectInert(`${closed}\n\nend.`);
    const truncated =
      'Docs:\n\n<!--\n' +
      `${OPEN} name="a">${PARAM_OPEN} name="p">x --> y\n` +
      `${SHELL}\n-->\n`;
    expect(extractXmlToolCalls(truncated)).toEqual([]);
    expect(tryRecoverXmlToolCalls(truncated).recovered).toBe(false);
  });

  it('does not let a prose mention of the tags unmask a comment', () => {
    const tail = `\n\n<!--\n${SHELL}\n`;
    expectInert(
      `The dialect writes ${PARAM_OPEN} name="value"> for arguments.${tail}`,
    );
    expectInert(
      `The dialect writes ${OPEN} name="x"> and ${PARAM_OPEN} name="value"> for arguments.${tail}`,
    );
  });

  it('keeps documentation markers working after a truncated value', () => {
    const lead = `${OPEN} name="a">${PARAM_OPEN} name="p">x`;
    for (const text of [
      `${lead}\n<!--\n${SHELL}\n-->\n`,
      `${lead}${FN_CLOSE}\n\`\`\`\n${SHELL}\n\`\`\`\n`,
      `${lead}${FN_CLOSE}\n<example>\n${SHELL}\n</example>\n`,
    ]) {
      expect(extractXmlToolCalls(text)).toEqual([]);
    }
  });

  it('does not dispatch a call documented in an indented code block', () => {
    const documented = invoke(
      'run_shell_command',
      param('command', `${invoke('b', param('p', 'w'))}\nrm -rf /tmp/x`),
    );
    expect(extractXmlToolCalls(`Docs:\n\n    ${documented}\n${READ}`)).toEqual([
      READ_CALL,
    ]);
  });

  it('recovers a call indented under prose or a list item', () => {
    for (const text of [
      `Here is the command:\n    ${READ}`,
      `Steps:\n\n- Run:\n    ${READ}`,
      `Steps:\n\n- Read the config\n\n    ${READ}`,
    ]) {
      expect(extractXmlToolCalls(text)).toEqual([READ_CALL]);
    }
  });

  it('keeps an indented line inside a value from becoming documentation', () => {
    const content = 'body\n\n    indented tail';
    const write = invoke(
      'write_file',
      param('file_path', 'a.txt') + param('content', content),
    );
    expect(extractXmlToolCalls(`${write}\n${READ}`)).toEqual([
      { name: 'write_file', args: { file_path: 'a.txt', content } },
      READ_CALL,
    ]);
  });

  it('does not dispatch a call inside an example wrapper', () => {
    expectInert(`<example>\n${SHELL}\n</example>`);
    expect(
      extractXmlToolCalls(`<example>\n${SHELL}\n</example>\n${READ}`),
    ).toEqual([READ_CALL]);
  });

  it('reads an example tag inside a code span as text', () => {
    expect(
      extractXmlToolCalls(`Wrap samples in \`<example>\`.\n${READ}`),
    ).toEqual([READ_CALL]);
  });

  it('does not let a prose parameter mention release an example-wrapped call', () => {
    expectInert(
      `The format mentions ${PARAM_OPEN} name="x"> without a terminator.\n<example>\n${SHELL}\n</example>`,
    );
  });

  it('does not let a value-borne example closer end a prose-opened example', () => {
    const text =
      '<example>\n' +
      invoke(
        'w',
        param('content', 'Use the closer tag to end the block</example>\ntail'),
      ) +
      `\n${SHELL}\n</example>\n${READ}`;
    expect(extractXmlToolCalls(text)).toEqual([READ_CALL]);
  });

  it('does not let an indented example closer end a documentation region', () => {
    const text =
      'Docs:\n\n<example>\n' +
      invoke('w', param('note', 'see')) +
      `\n\n    </example>\n\n${SHELL}\n\n</example>\n`;
    expect(extractXmlToolCalls(text)).toEqual([]);
    expect(tryRecoverXmlToolCalls(text).recovered).toBe(false);
  });

  it('keeps documentation inert when only its quoted value closes the region', () => {
    const quoted = invoke('b', param('p', 'w'));
    const live = invoke('c', param('q', 'z'));
    expectInert(
      '<example>\n' +
        `${OPEN} name="a">${PARAM_OPEN} name="content">${quoted}</example>\n${PARAM_CLOSE}${CLOSE}\n` +
        live,
    );
    expectInert(
      '```\n' +
        `${OPEN} name="a">${PARAM_OPEN} name="content">${quoted}\n\`\`\`\n${PARAM_CLOSE}${CLOSE}\n` +
        live,
    );
  });

  it('does not let a stray later closer widen an example region', () => {
    const quoted = invoke('b', param('p', 'w'));
    const write = invoke(
      'write_file',
      param('content', `${quoted}\n<example>x</example>`),
    );
    const text = `<example>\n${write}\n</example>\n${READ}\nClose examples with </example>.`;
    expect(names(text)).toEqual(['read_file']);
  });

  it('treats a fence line inside a value as data on both sides of it', () => {
    const quoted = invoke('read_file', param('file_path', 'quoted-only.txt'));
    const write = invoke(
      'write_file',
      param('content', `${quoted}\n\`\`\`\ntail`),
    );
    expect(names(`${write}\n\`\`\`\nDocumentation\n\`\`\`\n${READ}`)).toEqual([
      'write_file',
      'read_file',
    ]);
    // Inside a prose fence the write is documentation; its fence line does not
    // close that fence, so the shell stays documented and the read is live.
    expect(names(['```', write, SHELL, '```', READ].join('\n'))).toEqual([
      'read_file',
    ]);
  });

  it('skips the markdown lexer when the text has no example tag or is too long', () => {
    const spy = vi.spyOn(Lexer, 'lexInline');
    try {
      expect(extractXmlToolCalls(READ)).toEqual([READ_CALL]);
      expect(spy).not.toHaveBeenCalled();
      const long = `<example>\n${SHELL}\n</example>\n${'data '.repeat(14000)}`;
      expect(extractXmlToolCalls(long)).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
      expect(extractXmlToolCalls(`<example>\n${SHELL}\n</example>`)).toEqual(
        [],
      );
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('XmlToolCallTextBuffer in documentation regions', () => {
  it('does not hold a call shown in a comment, an example or indented code', () => {
    for (const text of [
      `Docs:\n\n<!--\n${SHELL}\n-->\n`,
      `Docs:\n\n<example>\n${SHELL}\n</example>\n`,
      `Docs:\n\n    ${SHELL}\n`,
    ]) {
      const buffer = new XmlToolCallTextBuffer();
      expect(buffer.accept(text)).toBe(text);
      expect(buffer.buffered).toBe(false);
    }
  });

  it('holds a live call that follows a documented one', () => {
    const documented = `Docs:\n\n<!--\n${SHELL}\n-->\n\n`;
    const buffer = new XmlToolCallTextBuffer();
    expect(buffer.accept(documented + READ)).toBe(documented);
    expect(buffer.remainingText).toBe(READ);
  });
});
