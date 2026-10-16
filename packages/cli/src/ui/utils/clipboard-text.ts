/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { getWindowsClipboardText } from '@organizaone/o1-code-core/utils/windows-clipboard.js';

export function readWindowsClipboardText(): string | undefined {
  try {
    return getWindowsClipboardText();
  } catch {
    return undefined;
  }
}
