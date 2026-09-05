// Android time field: pressable chip opening the native Compose time dialog.
// Geometry/behavior twin: time-field.web.tsx (DOM <input type="time">).
import { Host, TimePickerDialog } from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseDayTime, toDateString } from '@/utils/date';

import { FieldChrome, type TimeFieldProps } from './field-chrome';

export function TimeField({ value, onChange, testID }: TimeFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={() => {
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
        <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
      </Pressable>
      {open && (
        <Host style={styles.dialogHost}>
          <TimePickerDialog
            // The time component reads local wall time from the Date.
            initialDate={(
              parseDayTime(toDateString(new Date()), value) ?? new Date()
            ).toISOString()}
            is24Hour
            onDateSelected={(d) => {
              const hh = `${d.getHours()}`.padStart(2, '0');
              const mm = `${d.getMinutes()}`.padStart(2, '0');
              onChange(`${hh}:${mm}`);
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
  dialogHost: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
});
