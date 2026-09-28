/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { type MutableRefObject, useCallback, useRef } from 'react';
import { type DOMElement } from 'ink';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useMouseEvents } from '../../hooks/useMouseEvents.js';
import { useContextMenu } from '../../context-menu/ContextMenuContext.js';
import { type MouseEvent } from '../../utils/mouse.js';
import {
  measureElementPosition,
  layoutRowForEvent,
} from '../../utils/measure-element-position.js';
import {
  visualClickToOffset,
  type ClickableBufferState,
} from '../../utils/input-mouse.js';

export interface TextInputMouseControllerProps {
  /** The lines container node (the text area, positioned after the prefix). */
  linesRef: MutableRefObject<DOMElement | null>;
  /** Buffer visual state plus the cursor mover. */
  buffer: ClickableBufferState & {
    visualScrollRow: number;
    moveToOffset: (offset: number) => void;
  };
  /** Number of visual lines currently rendered (linesToRender.length). */
  visibleLineCount: number;
}

/**
 * Headless mouse layer for the prompt input: a click positions the text
 * cursor under the pointer. Rendered only while mouse input is enabled, so its
 * provider dependencies (KeypressProvider, via useMouseEvents) are only
 * required then.
 *
 * The cursor moves on release, and only when the pointer did not drag: a drag
 * belongs to the screen's text selection, which drops its range as soon as
 * the selected cells repaint, and moving the cursor at press would repaint
 * them. Subscribes at the `'button'` tracking level: presses, releases and
 * motion while a button is held, no bare-motion stream.
 *
 * Coordinates are taken relative to the measured lines container, so the input
 * border row and the prefix column are accounted for automatically. Like the
 * other mouse layers this assumes alternate-screen coordinates; the owning
 * component only mounts it in that mode.
 */
export function TextInputMouseController({
  linesRef,
  buffer,
  visibleLineCount,
}: TextInputMouseControllerProps): null {
  const { rows: terminalHeight } = useTerminalSize();
  // Quiet while the context menu owns the pointer so a click on the menu
  // overlay can't also move the composer cursor underneath it.
  const { menu: contextMenu } = useContextMenu();
  const pressRef = useRef<{ col: number; row: number } | null>(null);

  const moveCursorTo = useCallback(
    (col: number, row: number) => {
      const lines = linesRef.current;
      if (!lines) return;

      const rect = measureElementPosition(lines);
      if (rect.height <= 0) return;

      const clickVisualRow =
        layoutRowForEvent(lines, row, terminalHeight) - rect.y;
      if (clickVisualRow < 0 || clickVisualRow >= visibleLineCount) return;

      const clickVisualCol = Math.max(0, col - 1 - rect.x);
      const absoluteVisualRow = buffer.visualScrollRow + clickVisualRow;
      const offset = visualClickToOffset(
        buffer,
        absoluteVisualRow,
        clickVisualCol,
      );
      if (offset !== null) buffer.moveToOffset(offset);
    },
    [linesRef, buffer, visibleLineCount, terminalHeight],
  );

  const handleMouse = useCallback(
    (event: MouseEvent) => {
      if (event.name === 'left-press') {
        pressRef.current = { col: event.col, row: event.row };
        return;
      }
      const press = pressRef.current;
      if (!press) return;
      if (event.name === 'move') {
        if (event.col !== press.col || event.row !== press.row) {
          pressRef.current = null;
        }
        return;
      }
      if (event.name === 'left-release') {
        pressRef.current = null;
        moveCursorTo(press.col, press.row);
      }
    },
    [moveCursorTo],
  );

  useMouseEvents(handleMouse, {
    isActive: contextMenu === null,
    tracking: 'button',
  });

  return null;
}
