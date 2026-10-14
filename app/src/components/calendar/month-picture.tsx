import { type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import {
  HEADER_GROUND,
  HEADER_TITLE_TYPE,
} from '@/components/calendar/month-header';
import {
  COUNTER_FOOTPRINT,
  DAY_NUMBER_HEIGHT,
  EVENT_GAP,
  SLOT_HEIGHT,
  WeekRow,
} from '@/components/calendar/week-row';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, FontFamilyBold, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  getFirstDayOfWeek,
  weekStartOf,
  type MonthAnchor,
} from '@/utils/calendar-grid';
import { toDateString } from '@/utils/date';

/** The picture is a square of this side, on every platform: it reads the
 *  same wherever it is pasted or posted, and a busy month stays the same
 *  size (a busy day shows "+N", as on the grid). Drawn at the phone's own
 *  width, every day was a thumbnail of cut titles and "+2"s; at a desktop's
 *  1024, the text was small in the picture. 700 is between (picked
 *  2026-10-15). Captured at 2x (see share-month): a 1400px image. */
const SIDE = 700;

/** The month name's bar and the weekday row, at fixed heights so the weeks
 *  can be given the rest. */
const TITLE_BAR_HEIGHT = 82;
const WEEKDAY_ROW_HEIGHT = 28;

/** Room beneath the last event, so it does not sit on the next row's rule. */
const ROW_FOOT = Spacing.one;

const noop = () => {};

/** The events touching the week that starts at `weekStart`. */
function inWeek(events: CalEvent[], weekStart: Date): CalEvent[] {
  const from = weekStart.getTime();
  const to = addDays(weekStart, 7).getTime();
  return events.filter((event) => {
    const last = Math.max(event.start.getTime(), event.end.getTime() - 1);
    return event.start.getTime() < to && last >= from;
  });
}

type Props = {
  month: MonthAnchor;
  /** The calendar's events, as onCalendar draws them (never discover mode's). */
  events: CalEvent[];
  todayStr: string;
  ref?: Ref<View>;
};

/**
 * One month as a picture: its name, the weekday row and its weeks, drawn by
 * the grid's own rows, in a square (see SIDE), the weeks sharing its
 * height evenly. Mounted off screen only while a picture is being taken (see
 * share-month); nothing in it responds to touch.
 */
export function MonthPicture({ month, events, todayStr, ref }: Props) {
  const theme = useTheme();
  const side = SIDE;
  const cellWidth = side / 7;
  const first = new Date(month.year, month.month0, 1);
  const last = new Date(month.year, month.month0 + 1, 0);
  const weeks: Date[] = [];
  for (let week = weekStartOf(first); week <= last; week = addDays(week, 7))
    weeks.push(week);

  const title = first.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    // 2024-01-07 is a Sunday; the row starts on the phone's first weekday.
    new Date(2024, 0, 7 + getFirstDayOfWeek() + i).toLocaleDateString(
      undefined,
      { weekday: 'short' }
    )
  );

  const weeksRoom = side - TITLE_BAR_HEIGHT - WEEKDAY_ROW_HEIGHT;

  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.picture,
        {
          left: -side * 4,
          width: side,
          height: side,
          backgroundColor: theme.background,
        },
      ]}
    >
      <View style={styles.header}>
        <ThemedText style={styles.title}>{title}</ThemedText>
      </View>
      <View style={styles.weekdays}>
        {weekdays.map((label) => (
          <View key={label} style={styles.weekdayCell}>
            <ThemedText type="small" style={styles.weekday}>
              {label}
            </ThemedText>
          </View>
        ))}
      </View>
      {weeks.map((week, index) => {
        const weekEvents = inWeek(events, week);
        // The weeks share what the bars leave of the picture; the last takes
        // the odd pixels.
        const share = Math.floor(weeksRoom / weeks.length);
        const rowHeight =
          index === weeks.length - 1
            ? weeksRoom - share * (weeks.length - 1)
            : share;
        // As the grid works it out (month-grid): the slots that fit, and
        // whether the "+N" counter fits in what they leave.
        const eventsHeight = rowHeight - DAY_NUMBER_HEIGHT - ROW_FOOT;
        const slots = Math.max(0, Math.floor(eventsHeight / SLOT_HEIGHT));
        const counterNeedsSlot =
          eventsHeight - slots * SLOT_HEIGHT + EVENT_GAP < COUNTER_FOOTPRINT;
        return (
          <WeekRow
            key={toDateString(week)}
            weekStart={toDateString(week)}
            rowHeight={rowHeight}
            cellWidth={cellWidth}
            slotCount={slots}
            counterNeedsSlot={counterNeedsSlot}
            events={weekEvents}
            todayStr={todayStr}
            focusedYear={month.year}
            focusedMonth0={month.month0}
            pulse={null}
            onOpenDay={noop}
            onPressEvent={noop}
            onCreateOnDay={noop}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Off screen: laid out and drawn, so it can be captured, but never seen.
  picture: {
    position: 'absolute',
    top: 0,
  },
  header: {
    height: TITLE_BAR_HEIGHT,
    justifyContent: 'flex-end',
    backgroundColor: HEADER_GROUND,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  title: {
    ...HEADER_TITLE_TYPE,
    fontFamily: FontFamilyBold,
    color: AccentColor,
  },
  weekdays: {
    height: WEEKDAY_ROW_HEIGHT,
    flexDirection: 'row',
    backgroundColor: HEADER_GROUND,
  },
  weekdayCell: {
    flex: 1,
    paddingLeft: 6,
  },
  weekday: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AccentColor,
  },
});
