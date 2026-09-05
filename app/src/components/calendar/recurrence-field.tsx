import type { ComponentType } from 'react';
import { StyleSheet, View, type TextInputProps } from 'react-native';

import type { RecurrencePreset } from '@/caldav/types';
import { ChipRow } from '@/components/fields/chip-row';
import { DateField } from '@/components/fields/date-field';
import { FieldRow } from '@/components/fields/field-row';
import { TextField } from '@/components/fields/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { addDays } from '@/utils/date';

/** Editor-side recurrence state ('custom' renders read-only, never writes). */
export type RecurrenceState =
  | { kind: 'none' }
  | { kind: 'preset'; preset: RecurrencePreset; end: RecurrenceEnd }
  | { kind: 'custom' };

export type RecurrenceEnd =
  | { type: 'forever' }
  | { type: 'until'; day: string }
  | { type: 'count'; n: number };

const PRESET_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
] as const;

const END_OPTIONS = [
  { value: 'forever', label: 'Forever' },
  { value: 'until', label: 'Until' },
  { value: 'count', label: 'After' },
] as const;

type Props = {
  value: RecurrenceState;
  onChange: (next: RecurrenceState) => void;
  /** Repeat end can't precede the event's (start) day. */
  startDay: string;
  /** Sheet shell passes BottomSheetTextInput for keyboard-aware behavior. */
  TextInputComponent?: ComponentType<TextInputProps>;
  testID?: string;
};

export function RecurrenceField({
  value,
  onChange,
  startDay,
  TextInputComponent,
  testID,
}: Props) {
  if (value.kind === 'custom') {
    return (
      <FieldRow label="Repeat" testID={testID}>
        <ThemedText type="small" themeColor="textSecondary">
          Custom rule (set in another app) — kept as is.
        </ThemedText>
      </FieldRow>
    );
  }

  const preset = value.kind === 'preset' ? value.preset : null;
  const end: RecurrenceEnd =
    value.kind === 'preset' ? value.end : { type: 'forever' };

  function selectPreset(next: (typeof PRESET_OPTIONS)[number]['value']) {
    if (next === 'none') onChange({ kind: 'none' });
    else onChange({ kind: 'preset', preset: next, end });
  }

  function selectEnd(type: (typeof END_OPTIONS)[number]['value']) {
    if (!preset) return;
    const nextEnd: RecurrenceEnd =
      type === 'forever'
        ? { type: 'forever' }
        : type === 'until'
          ? {
              type: 'until',
              day: end.type === 'until' ? end.day : addDays(startDay, 30),
            }
          : { type: 'count', n: end.type === 'count' ? end.n : 5 };
    onChange({ kind: 'preset', preset, end: nextEnd });
  }

  return (
    <View style={styles.column} testID={testID}>
      <FieldRow label="Repeat">
        <ChipRow
          options={PRESET_OPTIONS}
          value={preset ?? 'none'}
          onChange={selectPreset}
          testID={testID ? `${testID}-preset` : undefined}
        />
      </FieldRow>
      {preset && (
        <FieldRow label="Ends">
          <ChipRow
            options={END_OPTIONS}
            value={end.type}
            onChange={selectEnd}
            testID={testID ? `${testID}-end` : undefined}
          />
          {end.type === 'until' && (
            <DateField
              value={end.day}
              min={startDay}
              onChange={(day) =>
                onChange({
                  kind: 'preset',
                  preset,
                  end: { type: 'until', day },
                })
              }
              testID={testID ? `${testID}-until` : undefined}
            />
          )}
          {end.type === 'count' && (
            <View style={styles.countRow}>
              <TextField
                TextInputComponent={TextInputComponent}
                style={styles.countInput}
                value={end.n > 0 ? String(end.n) : ''}
                onChangeText={(text) => {
                  const n = Number(text.replace(/[^0-9]/g, ''));
                  onChange({
                    kind: 'preset',
                    preset,
                    end: { type: 'count', n },
                  });
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
                testID={testID ? `${testID}-count` : undefined}
              />
              <ThemedText type="small" themeColor="textSecondary">
                times
              </ThemedText>
            </View>
          )}
        </FieldRow>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: Spacing.two + Spacing.half,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  countInput: {
    minWidth: 72,
    textAlign: 'center',
  },
});
