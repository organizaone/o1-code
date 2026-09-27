/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { extendedTheme, theme } from '../semantic-colors.js';
import {
  LOGO_ANIMATIONS,
  LOGO_FRAME_MS,
  paintLogoFrame,
  restFrame,
  type LogoAnimationName,
  type LogoColor,
} from '../utils/logo-animation.js';

export interface AnimatedLogoProps {
  variant: LogoAnimationName;
  /** When true, the animation ends at once and the logo rests. */
  stop?: boolean;
  /** Called once, when the pass ends or `stop` cuts it short. */
  onDone?: () => void;
}

const resolve = (token: LogoColor): string => {
  switch (token) {
    case 'brand':
      return extendedTheme.ui.brand;
    case 'warning':
      return theme.status.warning;
    case 'code':
      return theme.text.code;
    case 'muted':
      return extendedTheme.ui.separator;
    case 'primary':
    case 'bright':
      return theme.text.primary;
    default:
      return theme.text.primary;
  }
};

const REST = paintLogoFrame(restFrame());

/**
 * The start-screen logo, animated once. Three rows: the blank row above the
 * pinned header, then the two logo rows. After one pass it rests on the
 * static logo.
 */
export const AnimatedLogo: React.FC<AnimatedLogoProps> = ({
  variant,
  stop = false,
  onDone,
}) => {
  const animation = LOGO_ANIMATIONS[variant];
  const [t, setT] = useState(0);
  const resting = stop || t >= animation.length;

  useEffect(() => {
    if (resting) return;
    const id = setInterval(() => setT((frame) => frame + 1), LOGO_FRAME_MS);
    return () => clearInterval(id);
  }, [resting]);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reported = useRef(false);
  useEffect(() => {
    if (resting && !reported.current) {
      reported.current = true;
      onDoneRef.current?.();
    }
  }, [resting]);

  const rows = resting ? REST : paintLogoFrame(animation.frame(t));
  return (
    <Box flexDirection="column" flexShrink={0}>
      {rows.map((runs, row) => (
        <Box key={row} height={1}>
          <Text>
            {runs.map((run, i) => (
              <Text
                key={i}
                color={resolve(run.color)}
                backgroundColor={
                  run.background ? resolve(run.background) : undefined
                }
                bold={run.color === 'bright'}
              >
                {run.text}
              </Text>
            ))}
          </Text>
        </Box>
      ))}
    </Box>
  );
};
