/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * How long a relaunched child may outlive its supervisor. Long enough to
 * finish a reply in flight, short enough that a host which killed the
 * supervisor and kept the child's stdin open is not left with a process that
 * runs forever.
 */
export const SUPERVISOR_GONE_GRACE_MS = 2 * 60_000;

export interface SupervisedProcess {
  /** True while the IPC channel to the parent that spawned us is open. */
  connected?: boolean;
  on(event: 'disconnect', listener: () => void): unknown;
  exit(code: number): void;
}

/**
 * Bounds the child's lifetime to its supervisor's. The supervisor spawns the
 * child with an IPC channel; when the supervisor dies, the channel closes and
 * `disconnect` fires, whatever killed it. Only a child our own supervisor
 * marked is bound: a host's IPC to a directly started o1-code is not ours, and
 * a process replaced in place has no parent to watch.
 *
 * @returns whether the lifetime was bound.
 */
export function bindSupervisorLifetime(
  proc: SupervisedProcess,
  supervised: boolean,
  schedule: (fn: () => void, ms: number) => { unref?: () => unknown } = (
    fn,
    ms,
  ) => setTimeout(fn, ms),
): boolean {
  if (!supervised || !proc.connected) return false;
  proc.on('disconnect', () => {
    // Unreferenced: a child that has nothing left to do may exit sooner on
    // its own; the timer only puts a ceiling on one that would run on.
    schedule(() => proc.exit(1), SUPERVISOR_GONE_GRACE_MS).unref?.();
  });
  return true;
}
