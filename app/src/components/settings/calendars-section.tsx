import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listCalendars, type CalendarChoice } from '@/caldav/events';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import { ChipRow } from '@/components/fields/chip-row';
import { FieldStack } from '@/components/fields/field-stack';
import {
  CalendarIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
} from '@/components/icons';
import {
  Card,
  CONTROL_HEIGHT,
  SettingsBlock,
  SettingsMessage,
  SettingsSection,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { refreshAgendaWidget } from '@/widget/app-refresh';
import { setDefaultCalendar, useDefaultCalendar } from '@/config/calendar-pref';
import {
  classifyConnectError,
  connectFailureMessage,
} from '@/config/dav-config';
import {
  setCalendarHidden,
  useHiddenCalendars,
} from '@/config/calendar-visibility';
import {
  getPhoneFirstDay,
  setWeekStart,
  useWeekStart,
} from '@/config/week-start';
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
  const hidden = useHiddenCalendars();
  const weekStart = useWeekStart();
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
            connectFailureMessage(
              classifyConnectError(err, { hadLogin: true }),
              err instanceof Error ? err.message : String(err)
            )
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
        const isHidden = hidden.includes(calendar.url);
        return (
          <SettingsBlock
            key={calendar.url}
            onPress={() => setDefaultCalendar(calendar.url)}
            selected={selected}
            testID={`settings-calendar-${calendar.name}`}
          >
            <View style={styles.row}>
              <CalendarMark
                icon={calendar.icon}
                size={MARK_SIZE}
                color={calendar.color ?? theme.textSecondary}
              />
              <ThemedText
                type="small"
                themeColor={isHidden ? 'placeholder' : undefined}
                style={styles.name}
              >
                {calendar.name}
              </ThemedText>
              {selected && <CheckIcon size={CHECK_SIZE} color={AccentColor} />}
              <Pressable
                onPress={() => {
                  setCalendarHidden(calendar.url, !isHidden);
                  // The widget redraws from its own fetch; tell it now.
                  refreshAgendaWidget();
                }}
                hitSlop={10}
                accessibilityRole="switch"
                accessibilityState={{ checked: !isHidden }}
                accessibilityLabel={`Show ${calendar.name} on the calendar`}
                testID={`settings-calendar-visible-${calendar.name}`}
              >
                {isHidden ? (
                  <EyeOffIcon size={CHECK_SIZE} color={theme.placeholder} />
                ) : (
                  <EyeIcon size={CHECK_SIZE} color={theme.textSecondary} />
                )}
              </Pressable>
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
          <SettingsMessage icon={EyeIcon}>
            Shown on the calendar and widget. Tap the eye to hide one.
          </SettingsMessage>
        </SettingsBlock>
      )}
      <SettingsBlock>
        <FieldStack label="Week starts on" icon={CalendarIcon}>
          <ChipRow
            options={[
              { value: 'monday', label: 'Monday' },
              { value: 'sunday', label: 'Sunday' },
              {
                value: 'phone',
                label: `Match phone (${dayName(getPhoneFirstDay())})`,
              },
            ]}
            value={weekStart}
            onChange={(next) => {
              setWeekStart(next);
              refreshAgendaWidget();
            }}
            singleLine
            testID="settings-week-start"
          />
        </FieldStack>
      </SettingsBlock>
    </SettingsSection>
  );
}

const CHECK_SIZE = 20;
const MARK_SIZE = 16;

/** A weekday's name in the phone's language, from Date#getDay's numbering
 *  (2024-01-07 was a Sunday). */
const dayName = (day: number) =>
  new Date(2024, 0, 7 + day).toLocaleDateString(undefined, {
    weekday: 'long',
  });

const styles = StyleSheet.create({
  // A control-height row once SettingsBlock's own padding is added.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: CONTROL_HEIGHT - 2 * Card.padV,
  },
  name: {
    flex: 1,
  },
});
