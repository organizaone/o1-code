/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  bindSupervisorLifetime,
  SUPERVISOR_GONE_GRACE_MS,
  type SupervisedProcess,
} from './supervisor-lifetime.js';

function fakeProcess(connected: boolean) {
  const listeners: Array<() => void> = [];
  const proc: SupervisedProcess = {
    connected,
    on: (_event, listener) => {
      listeners.push(listener);
      return proc;
    },
    exit: vi.fn(),
  };
  return { proc, disconnect: () => listeners.forEach((fn) => fn()) };
}

describe('bindSupervisorLifetime', () => {
  it('exits two minutes after the supervisor goes away', () => {
    // The host killed the supervisor and kept the child's stdin open: the
    // child is reparented and would otherwise run on indefinitely.
    const { proc, disconnect } = fakeProcess(true);
    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    const unref = vi.fn();
    const schedule = (fn: () => void, ms: number) => {
      scheduled.push({ fn, ms });
      return { unref };
    };

    expect(bindSupervisorLifetime(proc, true, schedule)).toBe(true);
    expect(scheduled).toHaveLength(0);

    disconnect();
    expect(scheduled).toEqual([
      { fn: expect.any(Function), ms: SUPERVISOR_GONE_GRACE_MS },
    ]);
    expect(SUPERVISOR_GONE_GRACE_MS).toBe(120_000);
    // The timer must not keep an otherwise finished child alive.
    expect(unref).toHaveBeenCalled();
    expect(proc.exit).not.toHaveBeenCalled();

    scheduled[0]!.fn();
    expect(proc.exit).toHaveBeenCalledWith(1);
  });

  it('does nothing for a child that is not supervised or has no channel', () => {
    // A host's own IPC to a directly started o1-code is not our supervisor;
    // a process replaced in place has no parent to watch.
    const direct = fakeProcess(true);
    expect(bindSupervisorLifetime(direct.proc, false)).toBe(false);
    const replaced = fakeProcess(false);
    expect(bindSupervisorLifetime(replaced.proc, true)).toBe(false);
    direct.disconnect();
    replaced.disconnect();
    expect(direct.proc.exit).not.toHaveBeenCalled();
    expect(replaced.proc.exit).not.toHaveBeenCalled();
  });
});
