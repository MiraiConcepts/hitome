// The month grid's hover on the web: a crosshair. The day under the mouse
// takes a wash of today's colour (blue, orange in discover mode), and its week row and weekday column a faint one, so
// the pointer reads which week and which weekday it is on at a glance. Each
// cell is marked with a data attribute and a stylesheet draws the wash on an
// overlay, which fades in and out; React never re-renders for a mouse move.
import { useEffect } from 'react';

import { TODAY_COLOR } from '@/components/calendar/today-mark';
import { AccentColor } from '@/constants/theme';
import { rgbHex } from '@/utils/color';

/** The hovered day's wash (alpha of today's blue): a lighter shade of the
 *  cell that marks today, so the two read as one family. */
const CELL = 0.3;
/** Its row and column's wash (white's alpha). */
const LINE = 0.045;
const FADE_MS = 90;

const CELLS = '[data-testid^="day-cell-"]';
const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(rgbHex(hex).slice(i, i + 2), 16)).join(', ');
const BLUE = channels(TODAY_COLOR);
const ORANGE = channels(AccentColor);
/** Set on the page's root while discover mode is on: the wash follows
 *  today's fill to orange. */
const DISCOVER_ATTR = 'data-hitome-discover';

let installed = false;

function install(): void {
  if (installed) return;
  installed = true;
  const style = document.createElement('style');
  // The wash sits behind the day number (z-index -1 inside the cell's own
  // stacking context), so the number keeps its colour under it.
  style.textContent = `
${CELLS} {
  isolation: isolate;
}
${CELLS}::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: transparent;
  transition: background-color ${FADE_MS}ms ease-out;
}
${CELLS}[data-cross='line']::after {
  background-color: rgba(255, 255, 255, ${LINE});
}
${CELLS}[data-cross='cell']::after {
  background-color: rgba(${BLUE}, ${CELL});
}
:root[${DISCOVER_ATTR}] ${CELLS}[data-cross='cell']::after {
  background-color: rgba(${ORANGE}, ${CELL});
}
`;
  document.head.appendChild(style);
}

export function GridSpotlight({ discover = false }: { discover?: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    if (discover) root.setAttribute(DISCOVER_ATTR, '');
    else root.removeAttribute(DISCOVER_ATTR);
    return () => root.removeAttribute(DISCOVER_ATTR);
  }, [discover]);
  useEffect(() => {
    install();
    let hovered: HTMLElement | null = null;
    let pointer: { x: number; y: number } | null = null;
    const marked = new Set<HTMLElement>();

    const mark = (next: HTMLElement | null) => {
      if (next === hovered) return;
      hovered = next;
      const want = new Map<HTMLElement, string>();
      if (next) {
        const at = next.getBoundingClientRect();
        for (const cell of document.querySelectorAll<HTMLElement>(CELLS)) {
          const box = cell.getBoundingClientRect();
          if (cell === next) want.set(cell, 'cell');
          else if (
            Math.abs(box.top - at.top) < 1 ||
            Math.abs(box.left - at.left) < 1
          )
            want.set(cell, 'line');
        }
      }
      for (const cell of [...marked])
        if (!want.has(cell)) {
          delete cell.dataset.cross;
          marked.delete(cell);
        }
      for (const [cell, kind] of want) {
        cell.dataset.cross = kind;
        marked.add(cell);
      }
    };

    /** The day cell under a point, if it is on the grid itself (not a dialog
     *  or popover laid over it). */
    const cellAt = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      if (!hit?.closest('[data-testid="month-grid"]')) return null;
      const own = hit.closest<HTMLElement>(CELLS);
      if (own) return own;
      // Over an event, which sits above the cells: the day beneath it.
      for (const cell of document.querySelectorAll<HTMLElement>(CELLS)) {
        const box = cell.getBoundingClientRect();
        if (x >= box.left && x < box.right && y >= box.top && y < box.bottom)
          return cell;
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer = { x: e.clientX, y: e.clientY };
      mark(cellAt(e.clientX, e.clientY));
    };
    const onLeave = () => {
      pointer = null;
      mark(null);
    };
    // A scroll moves the cells under a still mouse.
    const onScroll = () => {
      if (pointer) {
        hovered = null;
        mark(cellAt(pointer.x, pointer.y));
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onScroll, {
      passive: true,
      capture: true,
    });
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll, { capture: true });
      mark(null);
    };
  }, []);

  return null;
}
