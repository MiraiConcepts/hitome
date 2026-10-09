/**
 * How long something runs, short enough for a narrow column: "45 min", "2 hrs",
 * "1h 30m", "3 days". Nothing for an all-day event, or one that does not end
 * after it starts.
 */
export function durationLabel(
  start: Date,
  end: Date,
  allDay = false
): string | null {
  if (allDay) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes <= 0) return null;
  if (minutes >= 24 * 60) {
    const days = Math.round(minutes / (24 * 60));
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
  return `${hours}h ${rest}m`;
}
