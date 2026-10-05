// A one-way signal from the month view to the root layout: the grid has
// drawn at its landing position. The layout holds the first-run screen over
// the calendar until then, so Allow → calendar is one dissolve rather than a
// cut to a header over an empty grid.
const listeners = new Set<() => void>();

export function markCalendarReady(): void {
  for (const listener of [...listeners]) listener();
}

export function onCalendarReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
