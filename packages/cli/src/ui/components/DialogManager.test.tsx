/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { Config, OutputStyleDefinition } from '@organizaone/o1-code-core';
import { BUILT_IN_OUTPUT_STYLES } from '@organizaone/o1-code-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { DialogManager } from './DialogManager.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from '../contexts/UIActionsContext.js';

const CUSTOM_STYLE: OutputStyleDefinition = {
  name: 'Reviewer',
  source: 'project',
  description: 'Reviews without editing',
  keepCodingInstructions: false,
  prompt: 'Review only.',
};

const createUIState = (overrides: Partial<UIState>): UIState =>
  ({
    constrainHeight: false,
    terminalHeight: 40,
    staticExtraHeight: 0,
    mainAreaWidth: 100,
    auth: {},
    confirmUpdateExtensionRequests: [],
    settingInputRequests: [],
    pluginChoiceRequests: [],
    ...overrides,
  }) as UIState;

const renderDialogManager = (
  uiState: UIState,
  config: Partial<Config>,
): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <UIStateContext.Provider value={uiState}>
      <UIActionsContext.Provider value={{} as UIActions}>
        <DialogManager addItem={vi.fn()} terminalWidth={100} />
      </UIActionsContext.Provider>
    </UIStateContext.Provider>,
    { config: config as Config },
  );

describe('DialogManager', () => {
  it.each([true, false])(
    'keeps plugin controls inside the reserved dialog area with constrained height %s',
    (constrainHeight) => {
      const { lastFrame } = renderDialogManager(
        createUIState({
          constrainHeight,
          terminalHeight: 16,
          staticExtraHeight: 3,
          pluginChoiceRequests: [
            {
              marketplaceName: 'catalog',
              plugins: Array.from({ length: 8 }, (_, index) => ({
                name: `plugin-${index + 1}`,
                description: Array.from(
                  { length: 20 },
                  (_, line) => `Description line ${line + 1}`,
                ).join('\n'),
              })),
              onSelect: vi.fn(),
              onCancel: vi.fn(),
            },
          ],
        }),
        {},
      );

      const frame = lastFrame() ?? '';
      expect(frame.split('\n').length).toBeLessThanOrEqual(11);
      expect(frame).toContain('❯ plugin-1');
      expect(frame).toContain('Enter');
      expect(frame).toContain('Escape');
      expect(frame).toContain('╰');
    },
  );

  // The picker's list comes from the hook, which re-reads the style
  // directories on every open; wiring it to the built-ins instead would hide
  // every custom style and mount the rows during the disk read.
  describe('output style dialog', () => {
    it('offers the styles the session loaded, not just the built-ins', () => {
      const { lastFrame } = renderDialogManager(
        createUIState({
          isOutputStyleDialogOpen: true,
          outputStyleChoices: [...BUILT_IN_OUTPUT_STYLES, CUSTOM_STYLE],
        }),
        { getOutputStyle: vi.fn().mockReturnValue(CUSTOM_STYLE) },
      );

      expect(lastFrame()).toContain('❯ 6. Reviewer');
    });

    it('shows the loading row while the catalog is still empty', () => {
      const { lastFrame } = renderDialogManager(
        createUIState({
          isOutputStyleDialogOpen: true,
          outputStyleChoices: [],
        }),
        { getOutputStyle: vi.fn().mockReturnValue(undefined) },
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('Loading output styles…');
      expect(frame).not.toContain('1. default');
    });
  });
});
