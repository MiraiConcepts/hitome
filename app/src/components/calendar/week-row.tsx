import { memo, useEffect, useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { CalEvent } from '@/caldav/types';
import {
  EVENT_FONT_SIZE,
  EventBanner,
  EventChip,
} from '@/components/calendar/event-chip';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, layoutWeek } from '@/utils/calendar-grid';
import { eventDays, parseDay, toDateString } from '@/utils/date';

/** Height of one banner/chip slot inside a day cell. */
export const SLOT_HEIGHT = 18;
/** Clearance under the overflow counter. Slots divide the row by whole
 *  SLOT_HEIGHTs, so the leftover beneath the last one can be as little as 2dp
 *  — pinning the counter to that slot's top leaves it flush with the cell's
 *  bottom edge. Anchoring from the bottom instead guarantees this gap. */
const MORE_BOTTOM_INSET = 4;

/** Height of the day-number line at the top of each cell. */
export const DAY_NUMBER_HEIGHT = 22;

type WeekRowProps = {
  /** Week-start (Monday) dateString — the row's identity. */
  weekStart: string;
  rowHeight: number;
  /** Day-cell width in px — drives the chip title wrap estimate. */
  cellWidth: number;
  /** Visible event slots per cell (from row height); ≤0 renders numbers only. */
  slotCount: number;
  /** Events touching this week (pre-bucketed by the grid). */
  events: CalEvent[];
  todayStr: string;
  /** The settled month — days outside it render dimmed. Settled, not live, so
   *  the grid does not reshade under a finger mid-drag. */
  focusedYear: number;
  focusedMonth0: number;
  /** Web only: a month begins in this row, making it one of the CSS
   *  scroll-snap positions the browser pages between (see month-grid). */
  isMonthStart?: boolean;
  onPressDay: (day: string) => void;
  onPressEvent: (event: CalEvent) => void;
  /** Long-press a cell to see everything on that day. Empty days have
   *  nothing to show, so they do not arm the gesture at all. */
  onLongPressDay: (day: string) => void;
};

const pct = (n: number) => `${(n / 7) * 100}%` as const;

// Chip title wrap heuristic: slot layout runs before text renders, so fit is
// estimated from an averaged glyph width of the 11px title font. A title that
// fits beside its inline time keeps the one-slot form; an overflowing one
// takes the stacked form (time line, then the title wrapping to two lines).
// Satoshi averages ~0.56em/glyph in mixed case; estimating slightly wide
// biases borderline titles toward wrapping (an extra slot) instead of
// ellipsizing, which is the failure users actually notice. Derived from the
// event font size rather than hard-coded, because an estimate left behind by a
// larger font silently clips the second line of every wrapped title.
const CHIP_CHAR_PX = EVENT_FONT_SIZE * 0.56;
/** Horizontal chrome inside a chip: 3px bar + 3px gap + 3px right padding. */
const CHIP_CHROME_PX = 9;

/** Title lines a chip needs against the full cell width (time, when shown,
 *  sits on its own line and never competes with the title). */
function chipTitleLines(summary: string, cellWidth: number): number {
  const title = summary || '(untitled)';
  return title.length * CHIP_CHAR_PX > cellWidth - CHIP_CHROME_PX ? 2 : 1;
}

/** Horizontal chrome inside a banner: 4px padding each side + hairline. */
const BANNER_CHROME_PX = 9;

/** Same glyph-width estimate for banner titles, over the banner's full width. */
function bannerTitleLines(summary: string, widthPx: number): number {
  const title = summary || '(untitled)';
  return title.length * CHIP_CHAR_PX > widthPx - BANNER_CHROME_PX ? 2 : 1;
}

// Cell fills, solid rather than translucent washes so each cell renders
// exactly its stated color whatever sits behind it. Today outranks the
// neighbouring months — it keeps the blue even when it falls on their page —
// and every other day, weekend included, is left to the screen's background.
const TODAY_FILL = '#0060E0';
const OTHER_MONTH_FILL = '#2E3135';

/** How long a neighbouring month's shading takes to settle in or out. */
const DIM_MS = 200;

/** Month ordinal — the unit a row's two shares are compared by. */
const monthOrdOf = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/** The working week ends after this many columns — weeks start Monday, so
 *  five is the end of Friday. */
const WEEK_SPLIT_AFTER_COL = 5;

// Grid rules — every line in the grid.
//
// Opaque and a whole dp wide, both deliberately, so every line renders
// identically. A translucent rule composites with the cell wash behind it, and
// a hairline lands on a fractional device pixel — row height is the pane over
// six — so it is drawn at partial coverage and blends with that wash anyway.
// Either alone leaves the lines visibly disagreeing across plain, weekend,
// today and out-of-month cells; together they cover whole pixels in one flat
// color. One value serves both schemes: a mid grey reads against either
// background, so there is nothing left for the scheme to decide.
export const GRID_RULE = '#60646C';

/** Rule thickness. A border only covers a whole pixel once it spans two of
 *  them; anything thinner straddles a boundary, is antialiased into the cell
 *  behind it, and the lines stop matching. Two pixels needs 0.77dp at 2.625x
 *  and 0.58dp at 3.5x, so a whole dp clears it on any screen at 2x or denser
 *  — every modern phone — with room to spare rather than by a hair. */
export const RULE_WIDTH = 1;

/** Declared per row rather than on the list, because only the rows a month
 *  starts in are snap positions — that is what makes the browser page by
 *  month instead of by week. Inert off web. */
const WEB_SNAP_ROW =
  Platform.OS === 'web'
    ? ({ scrollSnapAlign: 'start' } as unknown as ViewStyle)
    : null;

export const WeekRow = memo(function WeekRow({
  weekStart,
  rowHeight,
  cellWidth,
  slotCount,
  events,
  todayStr,
  focusedYear,
  focusedMonth0,
  isMonthStart,
  onPressDay,
  onPressEvent,
  onLongPressDay,
}: WeekRowProps) {
  const theme = useTheme();

  const days = useMemo(() => {
    const start = parseDay(weekStart) ?? new Date();
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekStart]);

  // Days this week that any event touches — the same reach the popover uses
  // to pick its list, so a cell arms the long press exactly when the popover
  // would have something in it. Multi-day events count on every day they
  // cover, not just the one their chip lands in.
  const daysWithEvents = useMemo(() => {
    const set = new Set<string>();
    for (const event of events) {
      for (const day of eventDays(event.start, event.end)) set.add(day);
    }
    return set;
  }, [events]);

  // A week touches at most two months, so its shading is two blocks, not seven
  // cells — which is what lets this fade on a couple of animated values per row
  // instead of one per day. `split` is the column the second month starts at,
  // or 7 when the week sits inside a single month.
  const { firstOrd, lastOrd, split } = useMemo(() => {
    const first = monthOrdOf(days[0]);
    const last = monthOrdOf(days[6]);
    return {
      firstOrd: first,
      lastOrd: last,
      split: first === last ? 7 : days.findIndex((d) => monthOrdOf(d) === last),
    };
  }, [days]);

  const focusedOrd = focusedYear * 12 + focusedMonth0;
  // Seeded at the settled value so a row scrolling into view arrives already
  // shaded — only a change of focused month animates.
  const firstDim = useSharedValue(firstOrd === focusedOrd ? 0 : 1);
  const lastDim = useSharedValue(lastOrd === focusedOrd ? 0 : 1);
  useEffect(() => {
    firstDim.value = withTiming(firstOrd === focusedOrd ? 0 : 1, {
      duration: DIM_MS,
    });
    lastDim.value = withTiming(lastOrd === focusedOrd ? 0 : 1, {
      duration: DIM_MS,
    });
  }, [firstOrd, lastOrd, focusedOrd, firstDim, lastDim]);
  const firstFill = useAnimatedStyle(() => ({ opacity: firstDim.value }));
  const lastFill = useAnimatedStyle(() => ({ opacity: lastDim.value }));

  const layout = useMemo(() => {
    const chipSpan = (event: CalEvent) =>
      chipTitleLines(event.summary, cellWidth);
    const bannerRows = (event: CalEvent, spanCols: number) =>
      bannerTitleLines(event.summary, spanCols * cellWidth);
    return layoutWeek(days[0], events, slotCount, chipSpan, bannerRows);
  }, [days, events, slotCount, cellWidth]);

  return (
    <View
      style={[
        styles.row,
        { height: rowHeight },
        isMonthStart ? WEB_SNAP_ROW : null,
      ]}
    >
      <View style={styles.cells}>
        {/* Behind the cells, so today's fill still paints over the shading on
            a today that belongs to a neighbouring month. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.monthFill, { left: 0, width: pct(split) }, firstFill]}
        />
        {split < 7 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.monthFill, { left: pct(split), right: 0 }, lastFill]}
          />
        )}
        {days.map((day, col) => {
          const dateString = toDateString(day);
          const isToday = dateString === todayStr;
          const inMonth =
            day.getFullYear() === focusedYear &&
            day.getMonth() === focusedMonth0;
          // Today keeps a month's weight and ink wherever it sits, so it
          // reads as today even from a neighbouring month's grid.
          const muted = !isToday && !inMonth;
          const tint = isToday ? TODAY_FILL : undefined;
          const label =
            day.getDate() === 1
              ? `1 ${day.toLocaleDateString(undefined, { month: 'short' })}`
              : `${day.getDate()}`;
          return (
            <Pressable
              key={dateString}
              testID={`day-cell-${dateString}`}
              onPress={() => onPressDay(dateString)}
              onLongPress={
                daysWithEvents.has(dateString)
                  ? () => onLongPressDay(dateString)
                  : undefined
              }
              style={[
                styles.cell,
                tint != null && { backgroundColor: tint },
                col < 6 && styles.cellRule,
              ]}
            >
              <View style={styles.dayNumberWrap}>
                <ThemedText
                  type="small"
                  numberOfLines={1}
                  style={[
                    styles.dayNumber,
                    {
                      color: muted ? theme.textSecondary : theme.text,
                      // Muted days fall back to the `small` type's own 500 —
                      // a neighbouring month should not shout as loudly as
                      // the one being looked at.
                      fontWeight: muted ? '500' : '700',
                    },
                  ]}
                >
                  {label}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* The weekend split, drawn between the cells and the events: above the
          cells so no row's rule chops it up, below the events so a banner
          spanning the weekend is not sliced by it. Pulled up by its own width
          to bridge the row's top border and read as one continuous line. */}
      <View
        pointerEvents="none"
        style={[
          styles.weekSplit,
          { left: cellWidth * WEEK_SPLIT_AFTER_COL - RULE_WIDTH },
        ]}
      />

      {/* box-none: empty-area taps fall through to the day cells; only the
          chips and banners capture their own pixels. The overflow counter is
          a plain label, so the cell keeps both gestures underneath it. */}
      <View style={styles.overlay}>
        {layout.banners.map((banner) => (
          <EventBanner
            key={banner.event.id}
            placement={banner}
            titleLines={banner.rows > 1 ? 2 : 1}
            onPress={() => onPressEvent(banner.event)}
            style={{
              position: 'absolute',
              left: pct(banner.startCol),
              // left+right (not width) so the banner's own margins inset its
              // edges instead of shifting the whole bar sideways.
              right: pct(7 - banner.startCol - banner.span),
              top: banner.slot * SLOT_HEIGHT,
              height: banner.rows * SLOT_HEIGHT - 2,
            }}
          />
        ))}
        {layout.chips.map((chip) => (
          <EventChip
            key={chip.event.id}
            event={chip.event}
            titleLines={Math.min(2, chip.span)}
            onPress={() => onPressEvent(chip.event)}
            style={{
              position: 'absolute',
              left: pct(chip.col),
              width: pct(1),
              top: chip.slot * SLOT_HEIGHT,
              height: chip.span * SLOT_HEIGHT - 2,
            }}
          />
        ))}
        {slotCount >= 1 &&
          layout.overflow.map((count, col) =>
            count > 0 ? (
              // A label, not a target: the cell underneath owns both the tap
              // and the long press, so the counter must not swallow either.
              <View
                key={`more-${col}`}
                testID={`more-${toDateString(days[col])}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: pct(col),
                  width: pct(1),
                  bottom: MORE_BOTTOM_INSET,
                  height: SLOT_HEIGHT - 2,
                  justifyContent: 'center',
                }}
              >
                <ThemedText numberOfLines={1} style={styles.more}>
                  +{count}
                </ThemedText>
              </View>
            ) : null
          )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    borderTopWidth: RULE_WIDTH,
    borderTopColor: GRID_RULE,
  },
  cells: {
    flex: 1,
    flexDirection: 'row',
  },
  monthFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: OTHER_MONTH_FILL,
  },
  cell: {
    flex: 1,
    paddingTop: 2,
    alignItems: 'flex-start',
  },
  cellRule: {
    borderRightWidth: RULE_WIDTH,
    borderRightColor: GRID_RULE,
  },
  dayNumberWrap: {
    minWidth: DAY_NUMBER_HEIGHT - 4,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.one,
    marginLeft: 2,
    alignItems: 'center',
  },
  dayNumber: {
    fontSize: 14,
  },
  weekSplit: {
    position: 'absolute',
    top: -RULE_WIDTH,
    bottom: 0,
    width: RULE_WIDTH,
    backgroundColor: AccentColor,
  },
  overlay: {
    position: 'absolute',
    top: DAY_NUMBER_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
  more: {
    fontSize: 12,
    // Explicit, so the text centres in the slot rather than inheriting a line
    // box taller than it and drifting low.
    lineHeight: 14,
    paddingLeft: 5,
  },
});
