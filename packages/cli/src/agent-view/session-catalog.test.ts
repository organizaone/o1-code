/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import {
  discoverAgentSessionWorkspaces,
  mergeAgentSessionCatalog,
  readLatestTranscriptMessage,
} from './session-catalog.js';
import type { AgentViewSessionSnapshot } from './protocol.js';
import type { SessionListItem } from '@organizaone/o1-code-core/services/sessionService.js';
import type { SessionRegistryRecord } from '@organizaone/o1-code-core/services/session-registry.js';

const saved = (id: string, cwd: string): SessionListItem => ({
  sessionId: id,
  cwd,
  startTime: '2026-10-19T00:00:00.000Z',
  mtime: 100,
  prompt: `Prompt ${id}`,
  filePath: `${cwd}/${id}.jsonl`,
});

const live = (id: string, cwd: string): AgentViewSessionSnapshot => ({
  sessionId: id,
  state: {
    schemaVersion: 1,
    sessionId: id,
    ownership: 'managed',
    sessionState: 'working',
    processState: 'alive',
    attachState: 'detached',
    projectCwd: cwd,
    originalCwd: cwd,
    activeCwd: cwd,
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:01.000Z',
    worktree: { mode: 'none' },
  },
  activity: {
    schemaVersion: 1,
    model: 'mimo-v2.6-flash',
    lastActivityAt: '2026-10-19T00:00:01.000Z',
    capabilities: [],
  },
});

describe('agent session catalog', () => {
  it('merges live and saved top-level sessions by identity', () => {
    const rows = mergeAgentSessionCatalog(
      [saved('one', 'C:/repo'), saved('two', 'C:/repo')],
      [live('one', 'C:/repo'), live('three', 'C:/other')],
      'one',
    );
    expect(rows.map((row) => row.sessionId)).toEqual(['one', 'three', 'two']);
    expect(rows[0]).toMatchObject({
      status: 'working',
      current: true,
      model: 'mimo-v2.6-flash',
    });
    expect(rows[1]).toMatchObject({
      workspace: path.resolve('C:/other'),
      status: 'working',
    });
    expect(rows[2]).toMatchObject({ status: 'inactive', current: false });
  });

  it('excludes subagents and archived sessions', () => {
    const rows = mergeAgentSessionCatalog(
      [
        { ...saved('child', 'C:/repo'), parentSessionId: 'parent' },
        { ...saved('old', 'C:/repo'), isArchived: true },
      ],
      [],
      'child',
    );
    expect(rows).toEqual([]);
  });

  it('omits closed sessions with no conversation content', () => {
    expect(
      mergeAgentSessionCatalog(
        [{ ...saved('empty', 'C:/repo'), prompt: '' }],
        [],
        'other',
      ),
    ).toEqual([]);
  });

  it('marks conflicting workspace ownership unavailable', () => {
    const rows = mergeAgentSessionCatalog(
      [saved('one', 'C:/repo')],
      [live('one', 'C:/different')],
      'one',
    );
    expect(rows[0]).toMatchObject({ status: 'unknown', switchable: false });
  });

  it('lists independent direct terminals without offering an unsafe takeover', () => {
    const direct = {
      sessionId: 'one',
      cwd: 'C:/repo',
      name: 'Direct task',
      kind: 'tui',
      startedAt: 300,
    } as SessionRegistryRecord;
    const rows = mergeAgentSessionCatalog(
      [saved('one', 'C:/repo')],
      [],
      'other',
      [direct],
    );
    expect(rows[0]).toMatchObject({
      title: 'Prompt one',
      status: 'unknown',
      switchable: false,
      source: 'direct',
    });
  });

  it('preserves a managed worker when it also appears in the live registry', () => {
    const direct = {
      sessionId: 'one',
      cwd: 'C:/repo',
      name: 'Registry task',
      kind: 'tui',
      startedAt: 300,
    } as SessionRegistryRecord;
    const rows = mergeAgentSessionCatalog(
      [saved('one', 'C:/repo')],
      [live('one', 'C:/repo')],
      'one',
      [direct],
    );
    expect(rows[0]).toMatchObject({
      status: 'working',
      switchable: true,
      source: 'live',
    });
  });

  it('shows a recoverable failed turn without treating its worker as exited', () => {
    const snapshot = live('one', 'C:/repo');
    snapshot.state.sessionState = 'idle';
    snapshot.activity = {
      schemaVersion: 1,
      lastActivityAt: '2026-10-19T00:00:01.000Z',
      capabilities: [],
      lastResult: 'failed',
    };
    const rows = mergeAgentSessionCatalog(
      [saved('one', 'C:/repo')],
      [snapshot],
      'one',
    );
    expect(rows[0]).toMatchObject({
      status: 'failed',
      switchable: true,
      source: 'live',
    });
  });

  it('discovers persisted workspaces from bounded transcript heads', async () => {
    const base = await fs.mkdtemp(
      path.join(os.tmpdir(), 'o1-session-catalog-'),
    );
    try {
      const chats = path.join(base, 'projects', 'sample', 'chats');
      await fs.mkdir(chats, { recursive: true });
      await fs.writeFile(
        path.join(chats, 'one.jsonl'),
        `${JSON.stringify({ cwd: 'C:/Workspace/other' })}\n`,
      );
      await fs.writeFile(path.join(chats, 'bad.jsonl'), 'invalid\n');
      expect(await discoverAgentSessionWorkspaces(base)).toContain(
        path.resolve('C:/Workspace/other'),
      );
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });

  it('reads the last conversation message without loading the full transcript', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'o1-session-detail-'));
    try {
      const file = path.join(base, 'conversation.jsonl');
      await fs.writeFile(
        file,
        [
          JSON.stringify({
            type: 'user',
            message: { parts: [{ text: 'First request' }] },
          }),
          JSON.stringify({
            type: 'assistant',
            message: { parts: [{ text: 'Latest answer' }] },
          }),
          JSON.stringify({ type: 'system', systemPayload: { status: 'idle' } }),
        ].join('\n'),
      );
      expect(await readLatestTranscriptMessage(file)).toBe('Latest answer');
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });
});
