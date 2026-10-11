/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type { RemoteController } from './remote-controller.js';

/** Null when remote sessions are off for this process (`remote.enabled`, the kill switch). */
export const RemoteControllerContext = createContext<RemoteController | null>(
  null,
);

export const useRemoteController = (): RemoteController | null =>
  useContext(RemoteControllerContext);
