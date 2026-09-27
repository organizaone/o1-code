/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { themeManager } from './themes/theme-manager.js';
import type { SemanticColors } from './themes/semantic-tokens.js';
import type { ExtendedColors } from './themes/extended-tokens.js';

export const theme: SemanticColors = {
  get text() {
    return themeManager.getSemanticColors().text;
  },
  get background() {
    return themeManager.getSemanticColors().background;
  },
  get border() {
    return themeManager.getSemanticColors().border;
  },
  get ui() {
    return themeManager.getSemanticColors().ui;
  },
  get status() {
    return themeManager.getSemanticColors().status;
  },
};

export const extendedTheme: ExtendedColors = {
  get text() {
    return themeManager.getActiveTheme().extendedColors.text;
  },
  get ui() {
    return themeManager.getActiveTheme().extendedColors.ui;
  },
  get activity() {
    return themeManager.getActiveTheme().extendedColors.activity;
  },
};
