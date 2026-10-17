import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { listCalendars, type CalendarChoice } from '@/data/events';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import { ChipRow } from '@/components/fields/chip-row';
import { FieldStack } from '@/components/fields/field-stack';
import { CalendarIcon, CheckIcon } from '@/components/icons';
import {
  CALENDAR_ROLES,
  CalendarRoleSwitch,
} from '@/components/settings/calendar-role-switch';
import {
  Card,
  CONTROL_HEIGHT,
  SettingsBlock,
  SettingsBusy,
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
  orderCalendars,
  roleOf,
  setCalendarRole,
  useCalendarRoles,
  type CalendarRole,
} from '@/config/calendar-visibility';
import {
  getPhoneFirstDay,
  setWeekStart,
  useWeekStart,
} from '@/config/week-start';
import { AccentColor, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The web is clicked, has no widget, and its first day comes from the
 *  browser's language rather than a phone's region. */
const ON_WEB = Platform.OS === 'web';

/**
 * Which calendar new events go into. Every discovered calendar is read and
 * drawn regardless — this is only the write target, which CalDAV has no way to
 * express, so the app has to.
 */
export function CalendarsSection() {
  const theme = useTheme();
  const preferred = useDefaultCalendar();
  const roles = useCalendarRoles();
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

  // Nothing chosen yet means discovery order: the first row that is not a
  // tray calendar (those are filled from elsewhere, never written into).
  const writable = calendars?.filter((c) => roleOf(c.url, roles) !== 'tray');
  const selectedUrl =
    (preferred && writable?.find((c) => c.url === preferred)?.url) ??
    writable?.[0]?.url;

  function changeRole(url: string, role: CalendarRole) {
    setCalendarRole(url, role);
    // New events cannot go into the tray: move the default off it.
    if (role === 'tray' && url === selectedUrl) {
      const next = writable?.find((c) => c.url !== url);
      if (next) setDefaultCalendar(next.url);
    }
    // The widget redraws from its own fetch; tell it now.
    refreshAgendaWidget();
  }

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
          <SettingsBusy label="Loading…" />
        </SettingsBlock>
      )}
      {calendars &&
        orderCalendars(calendars, roles, selectedUrl).map((calendar) => {
          const selected = calendar.url === selectedUrl;
          const role = roleOf(calendar.url, roles);
          return (
            <SettingsBlock
              key={calendar.url}
              onPress={
                role === 'tray'
                  ? undefined
                  : () => setDefaultCalendar(calendar.url)
              }
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
                  themeColor={role === 'hidden' ? 'placeholder' : undefined}
                  style={styles.name}
                >
                  {calendar.name}
                </ThemedText>
                {selected && (
                  <CheckIcon size={CHECK_SIZE} color={AccentColor} />
                )}
                <CalendarRoleSwitch
                  name={calendar.name}
                  role={role}
                  onChange={(next) => changeRole(calendar.url, next)}
                  testID={`settings-calendar-role-${calendar.name}`}
                />
              </View>
            </SettingsBlock>
          );
        })}
      {calendars && calendars.length > 0 && (
        // What the tick means, once, at the foot of the card — the list
        // itself stays just the calendars.
        <SettingsBlock>
          {/* One line on every screen: a legend for the marks, side by side.
              The rows show they can be tapped; what each mark means is the
              part worth saying. */}
          <View style={styles.legend}>
            <SettingsMessage icon={CheckIcon}>New events</SettingsMessage>
            {CALENDAR_ROLES.map(({ role, Icon, name }) => (
              <SettingsMessage key={role} icon={Icon}>
                {name}
              </SettingsMessage>
            ))}
          </View>
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
                label: `Match ${ON_WEB ? 'browser' : 'phone'} (${dayName(getPhoneFirstDay())})`,
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
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.four,
    rowGap: Spacing.two,
  },
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
