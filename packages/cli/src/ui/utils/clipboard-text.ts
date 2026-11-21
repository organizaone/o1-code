/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { getWindowsClipboardText } from '@organizaone/o1-code-core/utils/windows-clipboard.js';

export function readWindowsClipboardText(): string | undefined {
  try {
    return getWindowsClipboardText();
  } catch {
    return undefined;
  }
}
