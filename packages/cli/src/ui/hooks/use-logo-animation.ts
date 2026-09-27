/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useTerminalSize } from './useTerminalSize.js';
import { useKeypress } from './useKeypress.js';
import { getLayoutTier } from '../utils/layout-tier.js';
import { pickLogoAnimation } from '../utils/logo-animation.js';
import type { AnimatedLogoProps } from '../components/AnimatedLogo.js';

/**
 * Decides, once per session, whether the pinned header's logo animates on the
 * start screen, and ends it at the first keypress. Returns the props for
 * `AnimatedLogo` while it plays, `undefined` otherwise.
 */
export function useLogoAnimation(
  pinned: boolean,
): AnimatedLogoProps | undefined {
  const settings = useSettings();
  const config = useConfig();
  const uiState = useUIState();
  const { columns } = useTerminalSize();
  const narrow = getLayoutTier(columns) === 'minimal';
  const started = uiState.history.length > 0;

  const [variant] = useState(() =>
    pinned &&
    uiState.useTerminalBuffer &&
    !narrow &&
    !started &&
    !config.getScreenReader() &&
    config.isInteractive()
      ? pickLogoAnimation(settings.merged.ui?.logoAnimation)
      : undefined,
  );
  const [stop, setStop] = useState(false);
  const [done, setDone] = useState(false);
  const playing = variant !== undefined && !done;

  useKeypress(() => setStop(true), { isActive: playing && !stop });

  // A narrow terminal or a first message ends it for good: it never restarts.
  const cut = narrow || started;
  useEffect(() => {
    if (playing && cut) setDone(true);
  }, [playing, cut]);

  const onDone = useCallback(() => setDone(true), []);

  if (!playing || cut) return undefined;
  return { variant, stop, onDone };
}
