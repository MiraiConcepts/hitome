import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listCalendars, type CalendarChoice } from '@/caldav/events';
import {
  SettingsNote,
  SettingsProblem,
  SettingsSection,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { setDefaultCalendar, useDefaultCalendar } from '@/config/calendar-pref';
import { AccentColor, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Which calendar new events go into. Every discovered calendar is read and
 * drawn regardless — this is only the write target, which CalDAV has no way to
 * express, so the app has to. Until now it was matched by hardcoded display
 * name and fell back to discovery order for anyone whose calendar was not
 * called 'carrein-calendar'.
 */
export function CalendarsSection() {
  const theme = useTheme();
  const preferred = useDefaultCalendar();
  const [calendars, setCalendars] = useState<CalendarChoice[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listCalendars()
      .then((list) => {
        if (alive) setCalendars(list);
      })
      .catch((err) => {
        if (alive)
          setProblem(
            err instanceof Error ? err.message : 'Could not list calendars'
          );
      });
    return () => {
      alive = false;
    };
  }, []);

  // Nothing chosen yet means discovery order, which is what the first row is.
  const selectedUrl = preferred ?? calendars?.[0]?.url;

  return (
    <SettingsSection title="Calendars" testID="settings-calendars">
      {problem && (
        <SettingsProblem testID="settings-calendars-problem">
          {problem}
        </SettingsProblem>
      )}
      {!calendars && !problem && <SettingsNote>Loading…</SettingsNote>}
      {calendars?.map((calendar) => {
        const selected = calendar.url === selectedUrl;
        return (
          <Pressable
            key={calendar.url}
            onPress={() => setDefaultCalendar(calendar.url)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}
            testID={`settings-calendar-${calendar.name}`}
          >
            <View
              style={[
                styles.swatch,
                { backgroundColor: calendar.color ?? theme.backgroundSelected },
              ]}
            />
            <ThemedText type="small" style={styles.name}>
              {calendar.name}
            </ThemedText>
            {selected && (
              <ThemedText type="smallBold" style={styles.selected}>
                New events
              </ThemedText>
            )}
          </Pressable>
        );
      })}
      {calendars && (
        <SettingsNote>
          Every calendar is shown in the grid. This only picks where a new event
          is created.
        </SettingsNote>
      )}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 36,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.one,
  },
  // The same 8pt dot the day popover and the chip row use for a calendar's
  // colour; borderRadius 4 on an 8pt box is a circle, not the 4px rounding.
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    flex: 1,
  },
  selected: {
    color: AccentColor,
  },
});
