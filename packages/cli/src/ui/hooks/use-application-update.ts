/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import { updateEventEmitter } from '../../utils/updateEventEmitter.js';
import {
  formatUpdateInstructions,
  getInstallationInfo,
} from '../../utils/installationInfo.js';
import { handleAutoUpdate } from '../handleAutoUpdate.js';
import type { UpdateObject } from '../utils/updateCheck.js';
import { t } from '../../i18n/index.js';
import { isAgentViewWorkerEnv } from '../../agent-view/worker-sideband.js';

export interface ApplicationUpdateState {
  info: UpdateObject;
  phase: 'available' | 'preparing' | 'ready' | 'failed' | 'restarting';
  canPrepare: boolean;
  canRestart: boolean;
  instructions: string[];
  error?: string;
}

interface ApplicationUpdateOptions {
  idle: boolean;
  blocked: boolean;
  autoPrepare: boolean;
  projectRoot: string;
  settings: LoadedSettings;
  allowRestart?: boolean;
  verifyRestart?: (version: string) => Promise<void>;
  restart: (version: string) => Promise<void>;
}

export function useApplicationUpdate(options: ApplicationUpdateOptions) {
  const [state, setState] = useState<ApplicationUpdateState>();
  const [open, setOpen] = useState(false);
  const live = useRef(options);
  live.current = options;
  const current = useRef(state);
  const generation = useRef(0);
  const restartIntent = useRef(0);
  const failure = useRef<string | undefined>(undefined);
  const publish = useCallback((next: ApplicationUpdateState) => {
    current.current = next;
    setState(next);
  }, []);

  const cancelPendingRestart = useCallback(() => {
    generation.current++;
    restartIntent.current++;
  }, []);
  useEffect(() => {
    const receive = (info: UpdateObject, explicit = false) => {
      if (current.current?.info.update.latest === info.update.latest) {
        if (explicit) setOpen(true);
        return;
      }
      const installation = getInstallationInfo(live.current.projectRoot, false);
      const manualWorkerUpdate =
        isAgentViewWorkerEnv() && installation.packageManager !== 'npm';
      publish({
        info,
        phase: 'available',
        canPrepare:
          installation.packageManager === 'npm' &&
          Boolean(installation.updateCommand),
        canRestart:
          !manualWorkerUpdate &&
          live.current.allowRestart !== false &&
          Boolean(
            installation.updateCommand ||
              (installation.isStandalone && installation.standaloneDir),
          ),
        instructions:
          live.current.allowRestart === false
            ? [
                t(
                  'Conversation recording is disabled. Keep this conversation open; updates take effect after you close and open the app.',
                ),
                ...formatUpdateInstructions(
                  installation,
                  info.update.latest,
                ).map((line) => t(line)),
              ]
            : [
                ...(manualWorkerUpdate
                  ? [
                      t(
                        'Close this session and update using the instructions below.',
                      ),
                    ]
                  : []),
                ...formatUpdateInstructions(
                  installation,
                  info.update.latest,
                ).map((line) => t(line)),
              ],
      });
      setOpen(true);
    };
    const failed = (data?: { message?: string }) => {
      failure.current = data?.message;
    };
    updateEventEmitter.on('update-available', receive);
    updateEventEmitter.on('update-failed', failed);
    return () => {
      cancelPendingRestart();
      updateEventEmitter.off('update-available', receive);
      updateEventEmitter.off('update-failed', failed);
    };
  }, [publish, cancelPendingRestart]);

  const prepare = useCallback(async (): Promise<boolean> => {
    const previous = current.current;
    if (
      !previous ||
      previous.phase === 'preparing' ||
      previous.phase === 'restarting'
    )
      return false;
    if (previous.phase === 'ready') return true;
    const attempt = ++generation.current;
    failure.current = undefined;
    publish({ ...previous, phase: 'preparing', error: undefined });
    let success = false;
    try {
      success =
        (await handleAutoUpdate(
          previous.info,
          {
            ...live.current.settings,
            merged: {
              ...live.current.settings.merged,
              general: {
                ...live.current.settings.merged.general,
                enableAutoUpdate: true,
              },
            },
          },
          live.current.projectRoot,
        )) === true;
    } catch (error) {
      failure.current = error instanceof Error ? error.message : String(error);
    }
    if (
      attempt !== generation.current ||
      current.current?.info !== previous.info
    )
      return false;
    publish({
      ...previous,
      phase: success ? 'ready' : 'failed',
      error: success
        ? undefined
        : (failure.current ??
          t('Automatic update failed. Please try updating manually.')),
    });
    return success;
  }, [publish]);

  useEffect(() => {
    if (
      options.idle &&
      options.autoPrepare &&
      state?.phase === 'available' &&
      state.canPrepare
    ) {
      void prepare();
    }
  }, [options.idle, options.autoPrepare, state, prepare]);

  const apply = useCallback(async () => {
    const previous = current.current;
    if (
      !previous ||
      (!previous.canRestart && !previous.canPrepare) ||
      !live.current.idle ||
      live.current.blocked
    )
      return;
    const intent = ++restartIntent.current;
    if (previous.canPrepare && !(await prepare())) return;
    if (!previous.canRestart) return;
    if (
      !live.current.idle ||
      live.current.blocked ||
      intent !== restartIntent.current
    )
      return;
    const ready = current.current;
    if (!ready) return;
    publish({ ...ready, phase: 'restarting' });
    try {
      await live.current.verifyRestart?.(ready.info.update.latest);
      if (
        !live.current.idle ||
        live.current.blocked ||
        intent !== restartIntent.current
      ) {
        publish({ ...ready, phase: ready.canPrepare ? 'ready' : 'available' });
        return;
      }
      await live.current.restart(ready.info.update.latest);
    } catch (error) {
      publish({
        ...ready,
        phase: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [prepare, publish]);

  const dismiss = useCallback(() => {
    restartIntent.current++;
    setOpen(false);
  }, []);
  const visible =
    open && options.idle && !options.blocked && state !== undefined;
  return useMemo(
    () => ({ state, visible, dismiss, apply }),
    [state, visible, dismiss, apply],
  );
}
