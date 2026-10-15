/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { createRequire } from 'node:module';

interface NativeClipboardModule {
  ClipboardManager: new () => { getText(): string };
}

export function readWindowsClipboardText(): string | undefined {
  try {
    // Vim paste is synchronous; loading on demand keeps startup independent of the optional binding.
    const native = createRequire(import.meta.url)(
      '@teddyzhu/clipboard',
    ) as NativeClipboardModule;
    return new native.ClipboardManager().getText();
  } catch {
    return undefined;
  }
}
