// The phone has no keyboard shortcuts; the web implementation lives in
// use-calendar-keys.web.ts.
export type CalendarKeys = {
  /** False while something sits over the grid (editor, day list, settings). */
  enabled: boolean;
  onNew: () => void;
  onToday: () => void;
  /** -1 for the month before the one in view, +1 for the one after. */
  onStepMonth: (step: -1 | 1) => void;
  /** Bring a day's month into view (an arrow key left the visible month). */
  onShowDay: (day: string) => void;
};

export function useCalendarKeys(_keys: CalendarKeys): void {}
