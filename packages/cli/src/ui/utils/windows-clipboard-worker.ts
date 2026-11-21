/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { parentPort } from 'node:worker_threads';
import { getWindowsClipboardImage } from '@organizaone/o1-code-core/utils/windows-clipboard.js';

if (!parentPort)
  throw new Error('Windows clipboard extraction requires a worker');
parentPort.postMessage(getWindowsClipboardImage());
