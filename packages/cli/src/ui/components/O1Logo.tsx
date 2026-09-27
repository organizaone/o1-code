/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { extendedTheme, theme } from '../semantic-colors.js';
import { renderLogoRows } from '../utils/logo-font.js';

const ROWS = renderLogoRows();

const color = (brand: boolean): string =>
  brand ? extendedTheme.ui.brand : theme.text.primary;

export const O1Logo: React.FC = () => (
  <Box flexDirection="column" flexShrink={0}>
    {ROWS.map((runs, row) => (
      <Text key={row}>
        {runs.map((run, i) => (
          <Text key={i} color={color(run.brand)}>
            {run.text}
          </Text>
        ))}
      </Text>
    ))}
  </Box>
);

/** The logo as one line of text, for terminals under 80 columns. */
export const O1Wordmark: React.FC = () => (
  <Text bold>
    <Text color={color(true)}>O1</Text>
    <Text color={color(false)}>-CODE</Text>
    <Text color={color(true)}>.</Text>
  </Text>
);
