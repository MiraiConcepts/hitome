// Keyboard for the month view on the web. Native twin: use-calendar-keys.ts.
import { useEffect, useRef } from 'react';

import { addDays, parseDay } from '@/utils/date';

import type { CalendarKeys } from './use-calendar-keys';

export type { CalendarKeys } from './use-calendar-keys';

const CELL_PREFIX = 'day-cell-';
/** Long enough for a month scroll to mount the target's row. */
const FOCUS_AFTER_SCROLL_MS = 400;

const ARROW_DAYS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

function cellFor(day: string): HTMLElement | null {
  return document.querySelector(`[data-testid="${CELL_PREFIX}${day}"]`);
}

/** Typing in a field, or a key with a modifier, belongs to someone else. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/**
 * N new event, T today, PageUp/PageDown a month, and the arrow keys walk
 * the focus from day to day (Enter then opens the focused day, as a click
 * does, since each cell is a button).
 */
export function useCalendarKeys(keys: CalendarKeys): void {
  // The handlers change every render; the listener is added once.
  const latest = useRef(keys);
  useEffect(() => {
    latest.current = keys;
  });

  useEffect(() => {
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const k = latest.current;
      if (!k.enabled || isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const step = ARROW_DAYS[e.key];
      if (step !== undefined) {
        const id =
          document.activeElement instanceof HTMLElement
            ? document.activeElement.dataset.testid
            : undefined;
        const from = id?.startsWith(CELL_PREFIX)
          ? id.slice(CELL_PREFIX.length)
          : null;
        if (!from || !parseDay(from)) return;
        e.preventDefault();
        const next = addDays(from, step);
        // The grid shows one month at a time, padded with its neighbours'
        // days: stepping into another month (YYYY-MM differs) brings that
        // month into view first.
        const cell = cellFor(next);
        if (cell && next.slice(0, 7) === from.slice(0, 7)) {
          cell.focus({ preventScroll: true });
          return;
        }
        k.onShowDay(next);
        clearTimeout(focusTimer);
        focusTimer = setTimeout(
          () => cellFor(next)?.focus({ preventScroll: true }),
          FOCUS_AFTER_SCROLL_MS
        );
        return;
      }

      switch (e.key) {
        case 'n':
        case 'N':
          e.preventDefault();
          k.onNew();
          break;
        case 't':
        case 'T':
          e.preventDefault();
          k.onToday();
          break;
        case 'PageUp':
          e.preventDefault();
          k.onStepMonth(-1);
          break;
        case 'PageDown':
          e.preventDefault();
          k.onStepMonth(1);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(focusTimer);
    };
  }, []);
}
