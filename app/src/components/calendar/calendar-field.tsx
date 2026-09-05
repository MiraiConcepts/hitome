import type { CalendarChoice } from '@/caldav/events';
import { ChipRow } from '@/components/fields/chip-row';
import { AccentColor } from '@/constants/theme';

type Props = {
  calendars: CalendarChoice[];
  /** Selected calendar URL (the create write target). */
  value: string;
  onChange: (url: string) => void;
  testID?: string;
};

/**
 * Create-only picker: which calendar a new event is written into, each
 * chip in its calendar's own color (the accent for an uncolored one — the
 * same fallback the grid's chips use). The form mounts it only when the
 * account has more than one calendar — a single calendar makes the choice
 * moot. No caption: the names say what the row is.
 */
export function CalendarField({ calendars, value, onChange, testID }: Props) {
  const options = calendars.map((c) => ({
    value: c.url,
    label: c.name,
    color: c.color ?? AccentColor,
  }));
  return (
    <ChipRow
      options={options}
      value={value}
      onChange={onChange}
      testID={testID ? `${testID}-pick` : undefined}
    />
  );
}
