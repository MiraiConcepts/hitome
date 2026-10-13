import { type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import {
  HEADER_GROUND,
  HEADER_TITLE_TYPE,
} from '@/components/calendar/month-header';
import {
  bannerTitleLines,
  chipSlots,
  DAY_NUMBER_HEIGHT,
  SLOT_HEIGHT,
  WeekRow,
} from '@/components/calendar/week-row';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, FontFamilyBold, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  getFirstDayOfWeek,
  layoutWeek,
  weekStartOf,
  type MonthAnchor,
} from '@/utils/calendar-grid';
import { toDateString } from '@/utils/date';

/** The picture's size, whatever the screen: 4:3, landscape, so titles have
 *  room and it reads the same pasted anywhere, from the phone too. A month
 *  whose busiest week needs more room makes it taller instead of hiding
 *  events. */
export const PICTURE_WIDTH = 1024;
export const PICTURE_HEIGHT = 768;
const CELL_WIDTH = PICTURE_WIDTH / 7;

/** The month name's bar and the weekday row, at fixed heights so the weeks
 *  can be given the rest. */
const TITLE_BAR_HEIGHT = 82;
const WEEKDAY_ROW_HEIGHT = 28;

/** A week with nothing in it still gets a cell of about the grid's shape. */
const MIN_SLOTS = 3;
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

/** The slots a week needs to show every event in it, none behind "+N". */
function slotsNeeded(weekStart: Date, events: CalEvent[]): number {
  const layout = layoutWeek(
    weekStart,
    events,
    // More than any day could fill, so nothing overflows.
    events.length * 2 + 1,
    (event) => chipSlots(event.summary, CELL_WIDTH),
    (event, span) => bannerTitleLines(event.summary, span * CELL_WIDTH),
    false
  );
  let need = 0;
  for (const b of layout.banners) need = Math.max(need, b.slot + b.rows);
  for (const c of layout.chips) need = Math.max(need, c.slot + c.span);
  return Math.max(MIN_SLOTS, need);
}

type Props = {
  month: MonthAnchor;
  /** The events on screen (hidden calendars already left out). */
  events: CalEvent[];
  todayStr: string;
  ref?: Ref<View>;
};

/**
 * One month as a picture: its name, the weekday row and its weeks, drawn by
 * the grid's own rows at a desktop's width, each week as tall as its busiest
 * day needs. Mounted off screen only while a picture is being taken (see
 * share-month); nothing in it responds to touch.
 */
export function MonthPicture({ month, events, todayStr, ref }: Props) {
  const theme = useTheme();
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

  const weeksRoom = PICTURE_HEIGHT - TITLE_BAR_HEIGHT - WEEKDAY_ROW_HEIGHT;

  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.picture, { backgroundColor: theme.background }]}
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
        const needed =
          DAY_NUMBER_HEIGHT +
          slotsNeeded(week, weekEvents) * SLOT_HEIGHT +
          ROW_FOOT;
        // The weeks share what the bars leave of 4:3; the last takes the
        // odd pixels.
        const share = Math.floor(weeksRoom / weeks.length);
        const fair =
          index === weeks.length - 1
            ? weeksRoom - share * (weeks.length - 1)
            : share;
        const rowHeight = Math.max(needed, fair);
        const slots = Math.floor(
          (rowHeight - DAY_NUMBER_HEIGHT - ROW_FOOT) / SLOT_HEIGHT
        );
        return (
          <WeekRow
            key={toDateString(week)}
            weekStart={toDateString(week)}
            rowHeight={rowHeight}
            cellWidth={CELL_WIDTH}
            slotCount={slots}
            counterNeedsSlot={false}
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
    left: -PICTURE_WIDTH * 4,
    top: 0,
    width: PICTURE_WIDTH,
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
