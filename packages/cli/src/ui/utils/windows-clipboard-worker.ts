/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { parentPort } from 'node:worker_threads';
import { getWindowsClipboardImage } from '@organizaone/o1-code-core/utils/windows-clipboard.js';

if (!parentPort)
  throw new Error('Windows clipboard extraction requires a worker');
parentPort.postMessage(getWindowsClipboardImage());
