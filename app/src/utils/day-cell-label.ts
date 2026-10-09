/**
 * What a screen reader says for a day cell in the month grid: the whole date
 * (with the year only when it is not this one), whether it is today, and how
 * many events it holds, those under the "+N" counter included. A day with
 * nothing on says nothing about events: silence is the empty cell's own look.
 * e.g. 'Friday 9 October, today, 3 events'.
 */
export function dayCellLabel(
  day: Date,
  {
    isToday,
    count,
    currentYear,
  }: { isToday: boolean; count: number; currentYear: number }
): string {
  const date = day.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: day.getFullYear() === currentYear ? undefined : 'numeric',
  });
  const parts = [date];
  if (isToday) parts.push('today');
  if (count > 0) parts.push(`${count} ${count === 1 ? 'event' : 'events'}`);
  return parts.join(', ');
}
