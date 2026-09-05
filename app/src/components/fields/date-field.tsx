// Android date field: pressable chip opening the native Compose date dialog.
// Geometry/behavior twin: date-field.web.tsx (DOM <input type="date">).
import { DatePickerDialog, Host } from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseDay } from '@/utils/date';

import { FieldChrome, type DateFieldProps } from './field-chrome';

/** '19 Jul 2026' — display only; the value stays 'YYYY-MM-DD'. */
function pretty(value: string): string {
  const d = parseDay(value);
  return d
    ? d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : value;
}

/** UTC-day contract: the Compose date state is a UTC-day value (plan §pickers). */
function toUtcDay(value: string): string {
  return `${value}T00:00:00Z`;
}

export function DateField({
  value,
  onChange,
  min,
  max,
  testID,
}: DateFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={() => {
          // The dialog is its own window; a keyboard left up from a text
          // field would sit under it and come back in the way after.
          Keyboard.dismiss();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.field,
          {
            borderColor: theme.backgroundSelected,
            backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
          },
        ]}
      >
        <Text style={[styles.value, { color: theme.text }]}>
          {pretty(value)}
        </Text>
      </Pressable>
      {open && (
        <Host style={styles.dialogHost}>
          <DatePickerDialog
            initialDate={toUtcDay(value)}
            {...(min || max
              ? {
                  selectableDates: {
                    ...(min ? { start: new Date(toUtcDay(min)) } : {}),
                    ...(max ? { end: new Date(toUtcDay(max)) } : {}),
                  },
                }
              : {})}
            onDateSelected={(d) => {
              onChange(d.toISOString().slice(0, 10));
              setOpen(false);
            }}
            onDismissRequest={() => setOpen(false)}
          />
        </Host>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    ...FieldChrome,
    justifyContent: 'center',
  },
  value: {
    fontSize: FieldChrome.fontSize,
    fontFamily: Fonts.sans,
  },
  // The dialog lives in its own window; its Host needs no footprint.
  dialogHost: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
});
