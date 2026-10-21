/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { SessionService } from '@organizaone/o1-code-core/services/sessionService.js';
import type { SessionListItem } from '@organizaone/o1-code-core/services/sessionService.js';
import { listLiveSessions } from '@organizaone/o1-code-core/services/session-registry.js';
import type { SessionRegistryRecord } from '@organizaone/o1-code-core/services/session-registry.js';
import { Storage } from '@organizaone/o1-code-core/config/storage.js';
import type { AgentViewSessionSnapshot } from './protocol.js';

export type AgentSessionStatus =
  | 'working'
  | 'needs_input'
  | 'failed'
  | 'idle'
  | 'inactive'
  | 'unknown';

export interface AgentSessionRow {
  sessionId: string;
  workspace: string;
  title: string;
  status: AgentSessionStatus;
  updatedAt: number;
  model?: string;
  branch?: string;
  summary?: string;
  lastMessage?: string;
  transcriptPath?: string;
  current: boolean;
  switchable: boolean;
  source: 'live' | 'saved' | 'direct';
}

const MAX_SAVED_PER_WORKSPACE = 80;
const MAX_PROJECTS = 64;
const MAX_TRANSCRIPT_SAMPLES = 8;
const MAX_HEAD_BYTES = 16 * 1024;
const MAX_TAIL_BYTES = 64 * 1024;

export async function loadAgentSessionCatalog(
  currentWorkspace: string,
  currentSessionId: string,
  listLive: () => Promise<unknown>,
): Promise<AgentSessionRow[]> {
  const [rawLive, direct] = await Promise.all([listLive(), listLiveSessions()]);
  const live = Array.isArray(rawLive)
    ? rawLive.filter(isAgentViewSessionSnapshot)
    : [];
  const workspaces = new Set<string>([path.resolve(currentWorkspace)]);
  for (const workspace of await discoverAgentSessionWorkspaces(
    Storage.getRuntimeBaseDir(),
  )) {
    workspaces.add(workspace);
  }
  for (const snapshot of live) {
    if (snapshot.state.projectCwd) {
      workspaces.add(path.resolve(snapshot.state.projectCwd));
    }
  }
  for (const record of direct) {
    if (record.kind === 'tui' || record.kind === undefined) {
      workspaces.add(path.resolve(record.cwd));
    }
  }
  const saved = (
    await Promise.all(
      [...workspaces].map(async (cwd) => {
        try {
          return (
            await new SessionService(cwd).listSessions({
              size: MAX_SAVED_PER_WORKSPACE,
            })
          ).items;
        } catch {
          return [];
        }
      }),
    )
  ).flat();
  return mergeAgentSessionCatalog(saved, live, currentSessionId, direct);
}

export async function discoverAgentSessionWorkspaces(
  runtimeBaseDir: string,
): Promise<string[]> {
  const projectsDir = path.join(runtimeBaseDir, 'projects');
  let projects: Array<Dirent<string>>;
  try {
    projects = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const workspaces = new Set<string>();
  for (const project of projects
    .filter((item) => item.isDirectory())
    .slice(0, MAX_PROJECTS)) {
    const chatsDir = path.join(projectsDir, project.name, 'chats');
    let chats: Array<Dirent<string>>;
    try {
      chats = await fs.readdir(chatsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const chat of chats
      .filter((item) => item.isFile() && item.name.endsWith('.jsonl'))
      .slice(0, MAX_TRANSCRIPT_SAMPLES)) {
      const cwd = await readTranscriptHeadCwd(path.join(chatsDir, chat.name));
      if (cwd) {
        workspaces.add(path.resolve(cwd));
        break;
      }
    }
  }
  return [...workspaces];
}

export async function loadAgentSessionExcerpt(
  row: AgentSessionRow,
): Promise<string | undefined> {
  const filePath =
    row.transcriptPath ??
    (await new SessionService(row.workspace).getSessionListItem(row.sessionId))
      ?.filePath;
  return filePath ? readLatestTranscriptMessage(filePath) : undefined;
}

export async function readLatestTranscriptMessage(
  filePath: string,
): Promise<string | undefined> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const { size } = await handle.stat();
    const start = Math.max(0, size - MAX_TAIL_BYTES);
    const buffer = Buffer.alloc(Math.min(size, MAX_TAIL_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer
      .subarray(0, bytesRead)
      .toString('utf8')
      .split(/\r?\n/u);
    for (let index = lines.length - 1; index >= (start > 0 ? 1 : 0); index--) {
      let record: unknown;
      try {
        record = JSON.parse(lines[index]);
      } catch {
        continue;
      }
      if (typeof record !== 'object' || record === null) continue;
      const value = record as Record<string, unknown>;
      if (value['type'] !== 'user' && value['type'] !== 'assistant') continue;
      const message = value['message'];
      if (typeof message !== 'object' || message === null) continue;
      const parts = (message as Record<string, unknown>)['parts'];
      if (!Array.isArray(parts)) continue;
      const text = parts
        .map((part) =>
          typeof part === 'object' &&
          part !== null &&
          typeof (part as Record<string, unknown>)['text'] === 'string'
            ? (part as Record<string, string>)['text']
            : '',
        )
        .join(' ')
        .trim();
      if (text) return text.slice(0, 500);
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

async function readTranscriptHeadCwd(
  filePath: string,
): Promise<string | undefined> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(MAX_HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer
      .subarray(0, bytesRead)
      .toString('utf8')
      .split('\n', 1)[0];
    const record: unknown = JSON.parse(head);
    if (typeof record !== 'object' || record === null) return undefined;
    const cwd = (record as Record<string, unknown>)['cwd'];
    return typeof cwd === 'string' && path.isAbsolute(cwd) ? cwd : undefined;
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

export function mergeAgentSessionCatalog(
  saved: readonly SessionListItem[],
  live: readonly AgentViewSessionSnapshot[],
  currentSessionId: string,
  direct: readonly SessionRegistryRecord[] = [],
): AgentSessionRow[] {
  const rows = new Map<string, AgentSessionRow>();
  for (const item of saved) {
    if (item.isArchived || item.parentSessionId) continue;
    if (!item.prompt.trim() && !item.goalObjective?.trim()) continue;
    const workspace = path.resolve(item.cwd);
    rows.set(item.sessionId.toLowerCase(), {
      sessionId: item.sessionId,
      workspace,
      title:
        item.customTitle ||
        item.prompt ||
        item.goalObjective ||
        'Untitled task',
      status: 'inactive',
      updatedAt: item.mtime,
      ...(item.gitBranch ? { branch: item.gitBranch } : {}),
      ...(item.prompt ? { lastMessage: item.prompt } : {}),
      transcriptPath: item.filePath,
      current: item.sessionId.toLowerCase() === currentSessionId.toLowerCase(),
      switchable: true,
      source: 'saved',
    });
  }
  for (const snapshot of live) {
    if (snapshot.state.ownership !== 'managed') continue;
    const key = snapshot.sessionId.toLowerCase();
    if (snapshot.state.processState === 'exited' && !rows.has(key)) continue;
    const workspace = path.resolve(snapshot.state.projectCwd);
    const prior = rows.get(key);
    if (
      !prior &&
      !snapshot.launch?.initialPrompt?.trim() &&
      !snapshot.activity?.queuedPromptText?.trim() &&
      !snapshot.activity?.queuedPromptPreview?.trim()
    )
      continue;
    const conflict = prior && !sameWorkspace(prior.workspace, workspace);
    const status = conflict ? 'unknown' : statusOf(snapshot);
    const title =
      snapshot.rosterEntry?.displayName ||
      prior?.title ||
      snapshot.activity?.summary ||
      'Untitled task';
    rows.set(key, {
      ...prior,
      sessionId: snapshot.sessionId,
      workspace,
      title,
      status,
      updatedAt:
        Date.parse(
          snapshot.activity?.lastActivityAt ?? snapshot.state.updatedAt,
        ) || 0,
      ...(snapshot.activity?.model || snapshot.launch?.model
        ? { model: snapshot.activity?.model ?? snapshot.launch?.model }
        : {}),
      ...(snapshot.activity?.summary
        ? { summary: snapshot.activity.summary }
        : {}),
      current: key === currentSessionId.toLowerCase(),
      switchable:
        !conflict &&
        (snapshot.state.processState === 'alive' ||
          snapshot.state.processState === 'hibernated' ||
          (snapshot.state.processState === 'exited' &&
            ['completed', 'idle', 'failed', 'stopped'].includes(
              snapshot.state.sessionState,
            ))),
      source: 'live',
    });
  }
  const managedIds = new Set(
    live.map((snapshot) => snapshot.sessionId.toLowerCase()),
  );
  for (const record of direct) {
    if (record.kind !== 'tui' && record.kind !== undefined) continue;
    const key = record.sessionId.toLowerCase();
    if (managedIds.has(key)) continue;
    const prior = rows.get(key);
    if (!prior) continue;
    const workspace = path.resolve(record.cwd);
    rows.set(key, {
      ...prior,
      sessionId: record.sessionId,
      workspace,
      title: prior?.title ?? record.name,
      status: 'unknown',
      updatedAt: Math.max(prior?.updatedAt ?? 0, record.startedAt),
      current: key === currentSessionId.toLowerCase(),
      switchable: false,
      source: 'direct',
    });
  }
  return [...rows.values()].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

function statusOf(snapshot: AgentViewSessionSnapshot): AgentSessionStatus {
  if (snapshot.state.sessionState === 'failed') return 'failed';
  if (snapshot.state.processState === 'exited') return 'inactive';
  if (snapshot.state.processState === 'hibernated') return 'inactive';
  if (snapshot.state.processState !== 'alive') return 'unknown';
  if (snapshot.activity?.lastResult === 'failed') return 'failed';
  switch (snapshot.state.sessionState) {
    case 'working':
      return 'working';
    case 'needs_input':
      return 'needs_input';
    case 'idle':
    case 'completed':
      return 'idle';
    default:
      return 'unknown';
  }
}

function sameWorkspace(a: string, b: string): boolean {
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

function isAgentViewSessionSnapshot(
  value: unknown,
): value is AgentViewSessionSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const state = record['state'];
  return (
    typeof record['sessionId'] === 'string' &&
    typeof state === 'object' &&
    state !== null &&
    typeof (state as Record<string, unknown>)['projectCwd'] === 'string'
  );
}
