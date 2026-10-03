/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getSettingsSchema } from '../../config/settingsSchema.js';
import {
  isInteractiveTerminal,
  shouldUseIncrementalRendering,
  shouldUseVirtualViewport,
} from './terminal-buffer.js';

describe('shouldUseIncrementalRendering', () => {
  it('defaults to incremental rendering when the setting is unset', () => {
    expect(shouldUseIncrementalRendering(undefined, {})).toBe(
      getSettingsSchema().ui.properties.incrementalRendering.default,
    );
    expect(shouldUseIncrementalRendering(undefined, {})).toBe(true);
  });

  it('respects an explicit setting', () => {
    expect(shouldUseIncrementalRendering(true, {})).toBe(true);
    expect(shouldUseIncrementalRendering(false, {})).toBe(false);
  });

  it('lets O1CODE_INCREMENTAL_RENDERING override the setting either way', () => {
    expect(
      shouldUseIncrementalRendering(true, {
        O1CODE_INCREMENTAL_RENDERING: '0',
      }),
    ).toBe(false);
    expect(
      shouldUseIncrementalRendering(undefined, {
        O1CODE_INCREMENTAL_RENDERING: '0',
      }),
    ).toBe(false);
    expect(
      shouldUseIncrementalRendering(false, {
        O1CODE_INCREMENTAL_RENDERING: '1',
      }),
    ).toBe(true);
  });

  it('ignores any other value of the environment variable', () => {
    expect(
      shouldUseIncrementalRendering(false, {
        O1CODE_INCREMENTAL_RENDERING: 'yes',
      }),
    ).toBe(false);
    expect(
      shouldUseIncrementalRendering(undefined, {
        O1CODE_INCREMENTAL_RENDERING: '',
      }),
    ).toBe(true);
  });
});

describe('shouldUseVirtualViewport', () => {
  it('defaults to virtual viewport when the setting is unset', () => {
    expect(shouldUseVirtualViewport(undefined, false, true)).toBe(
      getSettingsSchema().ui.properties.useTerminalBuffer.default,
    );
  });

  it('respects explicit terminal buffer settings', () => {
    expect(shouldUseVirtualViewport(true, false, true)).toBe(true);
    expect(shouldUseVirtualViewport(false, false, true)).toBe(false);
  });

  it('keeps screen-reader mode off the virtual viewport path', () => {
    expect(shouldUseVirtualViewport(undefined, true, true)).toBe(false);
    expect(shouldUseVirtualViewport(true, true, true)).toBe(false);
    expect(shouldUseVirtualViewport(false, true, true)).toBe(false);
  });

  it('keeps non-interactive output on the legacy append-only path', () => {
    expect(shouldUseVirtualViewport(undefined, false, false)).toBe(false);
    expect(shouldUseVirtualViewport(true, false, false)).toBe(false);
  });
});

describe('isInteractiveTerminal', () => {
  it('requires a TTY stdout outside CI', () => {
    expect(isInteractiveTerminal(true, {})).toBe(true);
    expect(isInteractiveTerminal(false, {})).toBe(false);
    expect(isInteractiveTerminal(undefined, {})).toBe(false);
  });

  it('keeps dumb terminals on the append-only path', () => {
    expect(isInteractiveTerminal(true, { TERM: 'dumb' })).toBe(false);
    expect(isInteractiveTerminal(true, { TERM: 'DUMB' })).toBe(false);
  });

  it('treats CI sessions as non-interactive unless CI is explicitly disabled', () => {
    expect(isInteractiveTerminal(true, { CI: 'true' })).toBe(false);
    expect(
      isInteractiveTerminal(true, { CONTINUOUS_INTEGRATION: 'true' }),
    ).toBe(false);
    expect(isInteractiveTerminal(true, { CI_NAME: 'buildkite' })).toBe(false);
    expect(isInteractiveTerminal(true, { CI: '' })).toBe(true);
    expect(isInteractiveTerminal(true, { CI: '0' })).toBe(true);
    expect(isInteractiveTerminal(true, { CI: 'false' })).toBe(true);
    expect(isInteractiveTerminal(true, { CI: 'False' })).toBe(true);
    expect(isInteractiveTerminal(true, { CONTINUOUS_INTEGRATION: '' })).toBe(
      true,
    );
    expect(isInteractiveTerminal(true, { CONTINUOUS_INTEGRATION: '0' })).toBe(
      true,
    );
    expect(
      isInteractiveTerminal(true, { CONTINUOUS_INTEGRATION: 'false' }),
    ).toBe(true);
    expect(
      isInteractiveTerminal(true, { CONTINUOUS_INTEGRATION: 'FALSE' }),
    ).toBe(true);
    expect(isInteractiveTerminal(true, { CI_NAME: '' })).toBe(true);
    expect(isInteractiveTerminal(true, { CI_NAME: '0' })).toBe(true);
    expect(isInteractiveTerminal(true, { CI_NAME: 'false' })).toBe(true);
    expect(isInteractiveTerminal(true, { CI_NAME: 'False' })).toBe(true);
  });
});
