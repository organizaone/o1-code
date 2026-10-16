/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const EstimatedArtWidth = 59;
const BoxBorderWidth = 1;
export const BOX_PADDING_X = 1;

// Calculate width based on art, padding, and border
export const UI_WIDTH =
  EstimatedArtWidth + BOX_PADDING_X * 2 + BoxBorderWidth * 2; // ~63

export const STREAM_DEBOUNCE_MS = 100;

export const SHELL_COMMAND_NAME = 'Shell Command';

export const SHELL_NAME = 'Shell';

// Tool status symbols used in ToolMessage component
export const TOOL_STATUS = {
  SUCCESS: '✓',
  PENDING: 'o',
  EXECUTING: '⊷',
  CONFIRMING: '?',
  CANCELED: '-',
  ERROR: 'x',
} as const;

// Keep ambiguous symbols narrow in CJK terminals. ConPTY advances an extra
// cell for selectors on plain text symbols; only emoji variants retain the
// selector on Windows. Tool output uses utils/text-presentation.ts.
const _VS15 = process.platform === 'win32' ? '' : '\uFE0E';
export const ICON = {
  DIAMOND: `◆${_VS15}`,
  CIRCLE_FILLED: `●${_VS15}`,
  TRIANGLE: `△${_VS15}`,
  CIRCLE_EMPTY: `○${_VS15}`,
  BULLSEYE: `◎${_VS15}`,
  REFERENCE: `※${_VS15}`,
  THEREFORE: `∴${_VS15}`,
  BECAUSE: `∵${_VS15}`,
  STAR: `★${_VS15}`,
  SPARKLE: '✳\uFE0E',
  RADIO_FILLED: `◉${_VS15}`,
  CIRCLE_LEFT_HALF: `◐${_VS15}`,
  CHECK: `✓${_VS15}`,
  CROSS: '✖\uFE0E',
} as const;

// cli-spinners' `dots`, the frames ink's responding spinner animates. Shared so
// a frame or rate change cannot land in one renderer only.
export const SPINNER_FRAMES = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
];

export const SPINNER_INTERVAL_MS = 80;

/**
 * The frame drawn while a call is parked on a confirmation: ink's
 * `LoadingIndicator` passes it as `nonRespondingDisplay`, so both renderers stop
 * animating and show this one instead. Shared so the value cannot drift.
 */
export const WAITING_SPINNER_FRAME = '⠏';
