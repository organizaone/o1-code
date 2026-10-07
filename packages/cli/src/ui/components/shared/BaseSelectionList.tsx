/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useContext, useEffect, useRef, useState } from 'react';
import { Text, Box, type DOMElement } from 'ink';
import { extendedTheme, theme } from '../../semantic-colors.js';
import { glyphs } from '../../glyphs.js';
import { useSelectionList } from '../../hooks/useSelectionList.js';
import { SettingsContext } from '../../contexts/SettingsContext.js';
import { useVirtualViewport } from '../../contexts/VirtualViewportContext.js';
import { useMouseTrackingEnabled } from '../../hooks/use-mouse-tracking-enabled.js';
import { RowMouseController } from './RowMouseController.js';

import type { SelectionListItem } from '../../hooks/useSelectionList.js';

export interface RenderItemContext {
  isSelected: boolean;
  titleColor: string;
  numberColor: string;
}

export interface BaseSelectionListProps<
  T,
  TItem extends SelectionListItem<T> = SelectionListItem<T>,
> {
  items: TItem[];
  initialIndex?: number;
  onSelect: (value: T) => void;
  onHighlight?: (value: T) => void;
  isFocused?: boolean;
  showNumbers?: boolean;
  disableVimNav?: boolean;
  showScrollArrows?: boolean;
  maxItemsToShow?: number;
  /** Gap (in rows) between each item. */
  itemGap?: number;
  /** `row` lays the items side by side, wrapping when they do not fit. */
  layout?: 'column' | 'row';
  renderItem: (item: TItem, context: RenderItemContext) => React.ReactNode;
}

function getScrollOffsetForIndex(
  activeIndex: number,
  itemCount: number,
  maxItemsToShow: number,
): number {
  return Math.max(
    0,
    Math.min(activeIndex - maxItemsToShow + 1, itemCount - maxItemsToShow),
  );
}

/**
 * Base component for selection lists that provides common UI structure
 * and keyboard navigation logic via the useSelectionList hook.
 *
 * This component handles:
 * - Radio button indicators
 * - Item numbering
 * - Scrolling for long lists
 * - Color theming based on selection/disabled state
 * - Keyboard navigation and numeric selection
 *
 * Specific components should use this as a base and provide
 * their own renderItem implementation for custom content.
 */
export function BaseSelectionList<
  T,
  TItem extends SelectionListItem<T> = SelectionListItem<T>,
>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused = true,
  showNumbers = true,
  disableVimNav = false,
  showScrollArrows = false,
  maxItemsToShow = 10,
  itemGap = 0,
  layout = 'column',
  renderItem,
}: BaseSelectionListProps<T, TItem>): React.JSX.Element {
  const { activeIndex, setActiveIndex, selectIndex } = useSelectionList({
    items,
    initialIndex,
    onSelect,
    onHighlight,
    isFocused,
    showNumbers,
    ...(disableVimNav ? { disableVimNav } : {}),
    horizontal: layout === 'row',
  });

  const [scrollOffset, setScrollOffset] = useState(() =>
    getScrollOffsetForIndex(activeIndex, items.length, maxItemsToShow),
  );

  // Handle scrolling for long lists
  useEffect(() => {
    const newScrollOffset = getScrollOffsetForIndex(
      activeIndex,
      items.length,
      maxItemsToShow,
    );
    if (activeIndex < scrollOffset) {
      setScrollOffset(activeIndex);
    } else if (activeIndex >= scrollOffset + maxItemsToShow) {
      setScrollOffset(newScrollOffset);
    }
  }, [activeIndex, items.length, scrollOffset, maxItemsToShow]);

  // Mouse input is enabled in alternate-screen mode (ui.useTerminalBuffer):
  // the hit-test relies on alternate-screen coordinates where
  // measureElementPosition rows line up with mouse event rows. In inline mode
  // the live region floats, so the layer is not mounted there. It is mounted
  // only when enabled, so dialogs that don't use it pull in no extra providers.
  // Read the context raw (not the throwing useSettings) so the component still
  // renders outside a SettingsProvider — e.g. in unit tests.
  const settings = useContext(SettingsContext);
  const mouseTrackingEnabled = useMouseTrackingEnabled();
  const isRow = layout === 'row';
  // The mouse hit-test maps screen rows to items, so a row layout opts out.
  const mouseEnabled =
    useVirtualViewport(settings?.merged.ui?.useTerminalBuffer) &&
    mouseTrackingEnabled &&
    !isRow;
  const containerRef = useRef<DOMElement | null>(null);
  const itemRefs = useRef<Array<DOMElement | null>>([]);

  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItemsToShow);
  const numberColumnWidth = String(items.length).length;

  return (
    <Box
      ref={containerRef}
      flexDirection={isRow ? 'row' : 'column'}
      flexWrap={isRow ? 'wrap' : 'nowrap'}
      rowGap={itemGap}
      columnGap={isRow ? 4 : 0}
    >
      {mouseEnabled && isFocused && items.length > 0 && (
        <RowMouseController
          containerRef={containerRef}
          itemRefs={itemRefs}
          scrollOffset={scrollOffset}
          isDisabled={(index) => !!items[index]?.disabled}
          onHoverIndex={setActiveIndex}
          onSelectIndex={selectIndex}
        />
      )}
      {/* Use conditional coloring instead of conditional rendering */}
      {showScrollArrows && !isRow && (
        <Text
          color={scrollOffset > 0 ? theme.text.primary : theme.text.secondary}
        >
          ▲
        </Text>
      )}

      {visibleItems.map((item, index) => {
        const itemIndex = scrollOffset + index;
        const isSelected = activeIndex === itemIndex;

        // Selected in the primary colour, never the colour of the frame
        // around the list; the rest recede (spec §6.3).
        let titleColor = theme.text.secondary;
        let numberColor = theme.text.secondary;

        if (isSelected) {
          titleColor = theme.text.primary;
          numberColor = theme.text.primary;
        } else if (item.disabled) {
          titleColor = extendedTheme.text.muted;
          numberColor = extendedTheme.text.muted;
        }

        if (!isFocused && !item.disabled) {
          numberColor = theme.text.secondary;
        }

        if (!showNumbers) {
          numberColor = theme.text.secondary;
        }

        const itemNumberText = `${String(itemIndex + 1).padStart(
          numberColumnWidth,
        )}.`;

        return (
          <Box
            key={item.key}
            alignItems="flex-start"
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
          >
            {/* Radio button indicator */}
            <Box minWidth={2} flexShrink={0}>
              <Text color={extendedTheme.ui.brand} aria-hidden>
                {isSelected ? glyphs().prompt : ' '}
              </Text>
            </Box>

            {/* Item number */}
            {showNumbers && (
              <Box
                marginRight={1}
                flexShrink={0}
                minWidth={itemNumberText.length}
                aria-state={{ checked: isSelected }}
              >
                <Text color={numberColor}>{itemNumberText}</Text>
              </Box>
            )}

            {/* Custom content via render prop */}
            <Box flexGrow={isRow ? 0 : 1}>
              {renderItem(item, {
                isSelected,
                titleColor,
                numberColor,
              })}
            </Box>
          </Box>
        );
      })}

      {showScrollArrows && !isRow && (
        <Text
          color={
            scrollOffset + maxItemsToShow < items.length
              ? theme.text.primary
              : theme.text.secondary
          }
        >
          ▼
        </Text>
      )}
    </Box>
  );
}
