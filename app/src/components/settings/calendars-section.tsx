import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listCalendars, type CalendarChoice } from '@/caldav/events';
import { CheckIcon } from '@/components/icons';
import {
  Card,
  CONTROL_HEIGHT,
  SettingsBlock,
  SettingsMessage,
  SettingsSection,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { setDefaultCalendar, useDefaultCalendar } from '@/config/calendar-pref';
import { AccentColor, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Which calendar new events go into. Every discovered calendar is read and
 * drawn regardless — this is only the write target, which CalDAV has no way to
 * express, so the app has to.
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
        <SettingsBlock>
          <SettingsMessage tone="problem" testID="settings-calendars-problem">
            {problem}
          </SettingsMessage>
        </SettingsBlock>
      )}
      {!calendars && !problem && (
        <SettingsBlock>
          <SettingsMessage>Loading…</SettingsMessage>
        </SettingsBlock>
      )}
      {calendars?.map((calendar) => {
        const selected = calendar.url === selectedUrl;
        return (
          <SettingsBlock
            key={calendar.url}
            onPress={() => setDefaultCalendar(calendar.url)}
            selected={selected}
            testID={`settings-calendar-${calendar.name}`}
          >
            <View style={styles.row}>
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: calendar.color ?? theme.backgroundSelected,
                  },
                ]}
              />
              <ThemedText type="small" style={styles.name}>
                {calendar.name}
              </ThemedText>
              {selected && <CheckIcon size={CHECK_SIZE} color={AccentColor} />}
            </View>
          </SettingsBlock>
        );
      })}
      {calendars && calendars.length > 0 && (
        // What the tick means, once, at the foot of the card — the list
        // itself stays just the calendars.
        <SettingsBlock>
          <SettingsMessage icon={CheckIcon}>
            Where new events go. Tap a calendar to change.
          </SettingsMessage>
        </SettingsBlock>
      )}
    </SettingsSection>
  );
}

const CHECK_SIZE = 20;

const styles = StyleSheet.create({
  // A control-height row once SettingsBlock's own padding is added.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: CONTROL_HEIGHT - 2 * Card.padV,
  },
  // The same 8pt dot the day popover and the chip row use for a calendar's
  // colour; borderRadius 4 on an 8pt box is a circle — the one shape left round.
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    flex: 1,
  },
});
