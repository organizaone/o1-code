/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { Content } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  applyMemoryProvenance,
  currentTurn,
  historyReadExternalContent,
  isExternalContentToolName,
} from './provenance.js';
import { parseAutoMemoryTopicDocument } from './scan.js';

const memory = [
  '---',
  'name: Deploy target',
  'description: where releases go',
  'type: reference',
  '---',
  '',
  'Releases go to the staging cluster first.',
  '',
].join('\n');

describe('external content detection', () => {
  it('treats web, MCP resource and MCP tools as external content', () => {
    expect(isExternalContentToolName('web_fetch')).toBe(true);
    expect(isExternalContentToolName('web_search')).toBe(true);
    expect(isExternalContentToolName('read_mcp_resource')).toBe(true);
    expect(isExternalContentToolName('mcp__tracker__get_issue')).toBe(true);
    expect(isExternalContentToolName('read_file')).toBe(false);
    expect(isExternalContentToolName('run_shell_command')).toBe(false);
  });

  it('finds a web call or an MCP response anywhere in the history', () => {
    const plain: Content[] = [
      { role: 'user', parts: [{ text: 'use pnpm' }] },
      {
        role: 'model',
        parts: [{ functionCall: { name: 'read_file', args: {} } }],
      },
    ];
    expect(historyReadExternalContent(plain)).toBe(false);
    expect(
      historyReadExternalContent([
        ...plain,
        {
          role: 'model',
          parts: [{ functionCall: { name: 'web_fetch', args: {} } }],
        },
      ]),
    ).toBe(true);
    expect(
      historyReadExternalContent([
        ...plain,
        {
          role: 'user',
          parts: [
            {
              functionResponse: { name: 'mcp__docs__search', response: {} },
            },
          ],
        },
      ]),
    ).toBe(true);
  });
});

describe('currentTurn', () => {
  it('starts at the last user text message, not at a tool result', () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'first' }] },
      {
        role: 'model',
        parts: [{ functionCall: { name: 'web_fetch', args: {} } }],
      },
      { role: 'user', parts: [{ text: 'second' }] },
      {
        role: 'model',
        parts: [{ functionCall: { name: 'read_file', args: {} } }],
      },
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'read_file', response: {} } }],
      },
    ];
    expect(currentTurn(history)).toEqual(history.slice(2));
    expect(historyReadExternalContent(currentTurn(history))).toBe(false);
    expect(currentTurn([])).toEqual([]);
  });
});

describe('applyMemoryProvenance', () => {
  it('records the session and keeps the body', () => {
    const next = applyMemoryProvenance(memory, {
      sessionId: 'session-1',
      externalContent: false,
    });
    expect(next).toContain('type: reference\nsession: session-1\n---');
    expect(next).not.toContain('external_content');
    expect(next).toContain('Releases go to the staging cluster first.');
  });

  it('marks external content and is read back by the scanner', () => {
    const next = applyMemoryProvenance(memory, {
      sessionId: 'session-1',
      externalContent: true,
    });
    expect(next).toContain('external_content: true');
    const doc = parseAutoMemoryTopicDocument('/m/reference/deploy.md', next!);
    expect(doc?.externalContent).toBe(true);
    expect(doc?.body).toBe('Releases go to the staging cluster first.');
  });

  it('replaces the session but never clears an external-content mark', () => {
    const first = applyMemoryProvenance(memory, {
      sessionId: 'session-1',
      externalContent: true,
    })!;
    const second = applyMemoryProvenance(first, {
      sessionId: 'session-2',
      externalContent: false,
    })!;
    expect(second).toContain('session: session-2');
    expect(second).not.toContain('session: session-1');
    expect(second).toContain('external_content: true');
  });

  it('handles CRLF files and leaves files without frontmatter alone', () => {
    const crlf = memory.replace(/\n/g, '\r\n');
    expect(
      applyMemoryProvenance(crlf, { sessionId: 's', externalContent: false }),
    ).toContain('session: s');
    expect(
      applyMemoryProvenance('just text', {
        sessionId: 's',
        externalContent: true,
      }),
    ).toBeNull();
  });

  it('leaves the scanner result unchanged for an unmarked memory', () => {
    const doc = parseAutoMemoryTopicDocument('/m/reference/deploy.md', memory);
    expect(doc).not.toHaveProperty('externalContent');
  });
});
