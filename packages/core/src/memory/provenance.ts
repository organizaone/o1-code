/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Content } from '@google/genai';
import { ToolNames } from '../tools/tool-names.js';
import { atomicWriteFile } from '../utils/atomicFileWrite.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { AUTO_MEMORY_INDEX_FILENAME } from './paths.js';

const debugLogger = createDebugLogger('AUTO_MEMORY_PROVENANCE');

/** Frontmatter key naming the session a memory was extracted from. */
export const MEMORY_SESSION_KEY = 'session';
/**
 * Frontmatter key set to `true` when the session that produced a memory also
 * read web or MCP content. Once set it is never cleared: a memory is only as
 * trustworthy as the least trusted session that wrote it.
 */
export const MEMORY_EXTERNAL_CONTENT_KEY = 'external_content';

const EXTERNAL_CONTENT_TOOLS: ReadonlySet<string> = new Set([
  ToolNames.WEB_FETCH,
  ToolNames.WEB_SEARCH,
  ToolNames.READ_MCP_RESOURCE,
]);

export function isExternalContentToolName(name: string): boolean {
  return EXTERNAL_CONTENT_TOOLS.has(name) || name.startsWith('mcp__');
}

/**
 * The current turn: everything from the last user text message on. Tool
 * results also arrive as user messages, so only a part with text counts.
 */
export function currentTurn(history: readonly Content[]): readonly Content[] {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (
      message.role === 'user' &&
      (message.parts ?? []).some(
        (part) => typeof part.text === 'string' && part.text.trim() !== '',
      )
    ) {
      return history.slice(i);
    }
  }
  return history;
}

/** True when any turn in `history` called a tool that brings in web or MCP content. */
export function historyReadExternalContent(
  history: readonly Content[],
): boolean {
  return history.some((message) =>
    (message.parts ?? []).some((part) => {
      const name = part.functionCall?.name ?? part.functionResponse?.name;
      return name !== undefined && isExternalContentToolName(name);
    }),
  );
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---(\n[\s\S]*)?$/;

function setFrontmatterValue(
  frontmatter: string,
  key: string,
  value: string,
): string {
  const line = new RegExp(`^${key}:[^\\n]*$`, 'm');
  return line.test(frontmatter)
    ? frontmatter.replace(line, `${key}: ${value}`)
    : `${frontmatter}\n${key}: ${value}`;
}

/**
 * Record where a memory came from in its own frontmatter. Returns the new
 * content, or null when the content has no frontmatter to extend (the file is
 * then left as the agent wrote it).
 */
export function applyMemoryProvenance(
  content: string,
  provenance: { sessionId: string; externalContent: boolean },
): string | null {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(FRONTMATTER);
  if (!match) {
    return null;
  }
  let frontmatter = setFrontmatterValue(
    match[1],
    MEMORY_SESSION_KEY,
    provenance.sessionId,
  );
  if (provenance.externalContent) {
    frontmatter = setFrontmatterValue(
      frontmatter,
      MEMORY_EXTERNAL_CONTENT_KEY,
      'true',
    );
  }
  return `---\n${frontmatter}\n---${match[2] ?? '\n'}`;
}

/**
 * Stamp each memory file the extraction agent wrote. Best-effort: a file that
 * vanished or cannot be rewritten keeps the content the agent wrote.
 */
export async function stampMemoryProvenance(
  filePaths: readonly string[],
  provenance: { sessionId: string; externalContent: boolean },
): Promise<void> {
  const unique = [...new Set(filePaths.map((p) => path.resolve(p)))].filter(
    (p) => p.endsWith('.md') && path.basename(p) !== AUTO_MEMORY_INDEX_FILENAME,
  );
  await Promise.all(
    unique.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const next = applyMemoryProvenance(content, provenance);
        if (next !== null && next !== content) {
          await atomicWriteFile(filePath, next, { encoding: 'utf-8' });
        }
      } catch (error) {
        debugLogger.debug(`Could not record provenance for ${filePath}`, error);
      }
    }),
  );
}
