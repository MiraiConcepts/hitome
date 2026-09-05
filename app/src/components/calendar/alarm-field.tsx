import { ChipRow } from '@/components/fields/chip-row';
import { FieldRow } from '@/components/fields/field-row';
import { ThemedText } from '@/components/themed-text';

/**
 * Editor-side alarm state. 'set' covers any duration offset (foreign
 * non-preset offsets stay editable); 'foreign' is an absolute-time or
 * RELATED=END alarm — shown read-only, never rewritten.
 */
export type AlarmState =
  | { kind: 'none' }
  | { kind: 'set'; offsetMinutes: number }
  | { kind: 'foreign' };

const TIMED_PRESETS = [
  { value: 'none', label: 'None' },
  { value: '0', label: 'At time' },
  { value: '5', label: '5m' },
  { value: '10', label: '10m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: '1440', label: '1d' },
] as const;

const ALLDAY_PRESETS = [
  { value: 'none', label: 'None' },
  { value: '-540', label: 'Morning of (9:00)' },
  { value: '900', label: 'Day before (9:00)' },
] as const;

/** '45m before' / '2h before' / '1d 2h before' — for foreign offsets. */
function offsetLabel(offsetMinutes: number): string {
  const abs = Math.abs(offsetMinutes);
  const d = Math.floor(abs / 1440);
  const h = Math.floor((abs % 1440) / 60);
  const m = abs % 60;
  const parts = [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean);
  const span = parts.length ? parts.join(' ') : '0m';
  return offsetMinutes >= 0 ? `${span} before` : `${span} after`;
}

type Props = {
  value: AlarmState;
  onChange: (next: AlarmState) => void;
  allDay: boolean;
  /** e.g. "Notifications are off — reminders won't ring here." */
  hint?: string | null;
  testID?: string;
};

export function AlarmField({ value, onChange, allDay, hint, testID }: Props) {
  if (value.kind === 'foreign') {
    return (
      <FieldRow label="Alert" testID={testID}>
        <ThemedText type="small" themeColor="textSecondary">
          Custom alert (set in another app) — kept as is.
        </ThemedText>
      </FieldRow>
    );
  }

  const presets = allDay ? ALLDAY_PRESETS : TIMED_PRESETS;
  const selected = value.kind === 'set' ? String(value.offsetMinutes) : 'none';
  const options =
    value.kind === 'set' && !presets.some((p) => p.value === selected)
      ? [
          ...presets,
          { value: selected, label: offsetLabel(value.offsetMinutes) },
        ]
      : [...presets];

  return (
    <FieldRow label="Alert" testID={testID}>
      <ChipRow
        options={options}
        value={selected}
        onChange={(next) =>
          onChange(
            next === 'none'
              ? { kind: 'none' }
              : { kind: 'set', offsetMinutes: Number(next) }
          )
        }
        testID={testID ? `${testID}-offset` : undefined}
      />
      {hint && (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
    </FieldRow>
  );
}
