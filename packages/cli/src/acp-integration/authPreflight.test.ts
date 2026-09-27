/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Drift detector for `buildAuthPreflightCell`'s env-key map.
 *
 * `AUTH_PREFLIGHT_ENV_KEYS` in `acpAgent.ts` is a hand-maintained mirror of
 * `AUTH_ENV_MAPPINGS` in `core/src/models/constants.ts` — core's table isn't
 * on the public package surface, so cli copies the relevant subset. When a
 * new provider lands in core, this map must be updated — otherwise preflight
 * silently reports `status: 'unknown'` for a working provider.
 *
 * This test walks the public `AuthType` enum and asserts every value is
 * keyed in `AUTH_PREFLIGHT_ENV_KEYS`. Adding a new `AuthType` without
 * triaging it here breaks CI loudly instead of degrading silently.
 *
 * Lives in its own file so it can `import` the real `AuthType` enum without
 * fighting the heavy `vi.mock('@organizaone/o1-code-core', ...)` block in
 * `acpAgent.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { AuthType } from '@organizaone/o1-code-core';
import { AUTH_PREFLIGHT_ENV_KEYS } from './acpAgent.js';

describe('AUTH_PREFLIGHT_ENV_KEYS drift detection', () => {
  it('covers every public AuthType value', () => {
    const allAuthTypes = Object.values(AuthType) as string[];
    const keyed = new Set(Object.keys(AUTH_PREFLIGHT_ENV_KEYS));

    // Failure here means a new AuthType value landed in core that hasn't
    // been added to AUTH_PREFLIGHT_ENV_KEYS in
    // packages/cli/src/acp-integration/acpAgent.ts.
    expect(allAuthTypes.filter((authType) => !keyed.has(authType))).toEqual([]);
  });

  it('checks OPENAI_API_KEY for OpenAI Responses auth', () => {
    expect(AUTH_PREFLIGHT_ENV_KEYS[AuthType.USE_OPENAI_RESPONSES]).toContain(
      'OPENAI_API_KEY',
    );
  });

  it('every keyed entry has at least one env var candidate', () => {
    const empty = Object.entries(AUTH_PREFLIGHT_ENV_KEYS).filter(
      ([, vars]) => vars.length === 0,
    );
    expect(empty).toEqual([]);
  });
});
