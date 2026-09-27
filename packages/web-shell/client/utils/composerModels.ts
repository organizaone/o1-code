/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Whether the model picker is unavailable for a fresh standalone draft: no
 * session attached yet and the hydrated catalog has no user-selectable
 * models. Shared by every picker entry point (composer toolbar, StatusBar
 * button, /model command) so the gates never drift apart.
 */
export function isStandaloneModelPickerUnavailable(input: {
  sessionId: string | null | undefined;
  sessionContextKind: string | undefined;
  models: readonly { id: string }[] | undefined;
}): boolean {
  return (
    !input.sessionId &&
    input.sessionContextKind === 'standalone' &&
    (input.models ?? []).length === 0
  );
}
