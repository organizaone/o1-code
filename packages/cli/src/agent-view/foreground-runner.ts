/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { ensureAgentViewSupervisor } from './supervisor-runner.js';
import {
  callAgentViewSupervisor,
  watchAgentViewOwner,
} from './supervisor-client.js';
import { readAgentViewSupervisor } from './supervisor-store.js';
import { AgentSessionForegroundController } from './foreground-controller.js';
import { createSupervisorForegroundTransport } from './supervisor-foreground-transport.js';
import { loadAgentSessionCatalog } from './session-catalog.js';
import { runAgentSessionDashboard } from './session-dashboard.js';

export async function runAgentSessionForeground(
  onReady: () => void = () => {},
  options: { approvalMode?: string } = {},
): Promise<void> {
  const supervisor = await ensureAgentViewSupervisor();
  const record = await readAgentViewSupervisor();
  if (!record?.authToken) {
    throw new Error('Agent session supervisor authentication is unavailable.');
  }
  const ownerId = randomUUID();
  const lease = await watchAgentViewOwner(supervisor.socketPath, ownerId, {
    authToken: record.authToken,
  });
  let created: unknown;
  try {
    created = await callAgentViewSupervisor(
      supervisor.socketPath,
      'dispatch',
      { cwd: process.cwd(), interactive: true, ownerId, ...options },
      { authToken: record.authToken, timeoutMs: 30_000 },
    );
  } catch (error) {
    lease.dispose();
    throw error;
  }
  if (!isRecord(created) || typeof created['sessionId'] !== 'string') {
    lease.dispose();
    throw new Error('Agent session supervisor returned no session ID.');
  }
  const sessionId = created['sessionId'];
  const controller = new AgentSessionForegroundController(
    createSupervisorForegroundTransport({
      socketPath: supervisor.socketPath,
      authToken: record.authToken,
      peek: (id) => supervisor.peek(id),
    }),
  );
  let attached = false;
  try {
    await controller.select(sessionId);
    attached = true;
    onReady();
    let activeId = sessionId;
    let lastDashboardRequestId: string | undefined;
    while (controller.activeSessionId) {
      await delay(150);
      const snapshot = await supervisor.peek(activeId);
      const state = readState(snapshot);
      if (state?.['processState'] === 'exited') break;
      const requestId = readDashboardRequestId(snapshot);
      if (!requestId || requestId === lastDashboardRequestId) continue;
      lastDashboardRequestId = requestId;
      await controller.suspend();
      try {
        const loadRows = () =>
          loadAgentSessionCatalog(process.cwd(), activeId, () =>
            supervisor.list(),
          );
        const theme = readDashboardTheme(snapshot);
        const target = await runAgentSessionDashboard(
          loadRows,
          activeId,
          theme,
          readDashboardLanguage(snapshot),
          readDashboardThemeName(snapshot),
        );
        if (target && target !== activeId) {
          const row = (await loadRows()).find(
            (candidate) => candidate.sessionId === target,
          );
          if (!row?.switchable)
            throw new Error(`Session ${target} is unavailable.`);
          if (row.source === 'saved') {
            await supervisor.adopt({
              sessionId: target,
              projectCwd: row.workspace,
              activeCwd: row.workspace,
              terminal: {
                columns: process.stdout.columns ?? 80,
                rows: process.stdout.rows ?? 24,
              },
              ownerId,
              interactive: true,
            });
          } else {
            await callAgentViewSupervisor(
              supervisor.socketPath,
              'claimOwner',
              { ownerId, sessionId: target },
              { authToken: record.authToken },
            );
          }
          await controller.select(target);
          activeId = target;
          lastDashboardRequestId = readDashboardRequestId(
            await supervisor.peek(target),
          );
        } else {
          await controller.resume();
        }
      } catch (error) {
        await controller.resume();
        process.stderr.write(
          `Could not switch agent session: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    }
  } catch (error) {
    if (!attached) await supervisor.stop(sessionId).catch(() => {});
    throw error;
  } finally {
    try {
      await controller.suspend();
    } finally {
      lease.dispose();
    }
  }
}

function readDashboardRequestId(snapshot: unknown): string | undefined {
  if (!isRecord(snapshot) || !isRecord(snapshot['activity'])) return undefined;
  const id = snapshot['activity']['dashboardRequestId'];
  return typeof id === 'string' ? id : undefined;
}

function readDashboardTheme(snapshot: unknown): 'dark' | 'light' {
  if (!isRecord(snapshot) || !isRecord(snapshot['activity'])) return 'dark';
  return snapshot['activity']['theme'] === 'light' ? 'light' : 'dark';
}

function readDashboardThemeName(snapshot: unknown): string | undefined {
  if (!isRecord(snapshot) || !isRecord(snapshot['activity'])) return undefined;
  const name = snapshot['activity']['themeName'];
  return typeof name === 'string' ? name : undefined;
}

function readDashboardLanguage(snapshot: unknown): string {
  if (!isRecord(snapshot) || !isRecord(snapshot['activity'])) return 'auto';
  const language = snapshot['activity']['language'];
  return typeof language === 'string' ? language : 'auto';
}

function readState(snapshot: unknown): Record<string, unknown> | undefined {
  if (!isRecord(snapshot) || !isRecord(snapshot['state'])) return undefined;
  return snapshot['state'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
