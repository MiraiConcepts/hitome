import { memo, useCallback, useEffect, useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';

import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
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

/** Height of one banner/chip slot inside a day cell: one line of event text
 *  (EVENT_LINE_HEIGHT), the dp the strip stands proud of it at each end, and
 *  the gap to the strip below — 14 + 2 + 4.
 *
 *  A strip is sized to the slots it was granted rather than to the lines it
 *  renders, so every gap in a column is EVENT_GAP whatever sits above it. That
 *  forces a two-slot strip to be `2 × one-slot + EVENT_GAP`: the gap that
 *  would have separated two single strips is inside it. Shrink it below that
 *  and the difference does not vanish — it reappears as a wider gap under it.
 *
 *  Raising this trades events for room: a slot per cell is roughly five dp of
 *  row height, so 20 shows four events before the "+N" counter where 18 showed
 *  five. */
export const SLOT_HEIGHT = 20;
/** Clear space between one strip and the next — the app's spacing unit, which
 *  is also what separates everything else in the UI. It comes out of the slot,
 *  so raising it makes strips shorter rather than pushing them apart. */
export const EVENT_GAP = Spacing.one;
/** Clearance under the overflow counter, which is anchored to the cell's
 *  bottom edge rather than laid into a slot. */
const MORE_BOTTOM_INSET = 2;
/** The counter's own box — its line, nothing more. */
const COUNTER_HEIGHT = 14;
/** What the counter needs beneath the last strip to sit clear of it. Read by
 *  month-grid to decide whether a slot has to be surrendered for it. */
export const COUNTER_FOOTPRINT = COUNTER_HEIGHT + MORE_BOTTOM_INSET;

/** Height of the day-number line at the top of each cell — the number's own
 *  box plus the gap that holds the first event off it. */
export const DAY_NUMBER_HEIGHT = 24;

type WeekRowProps = {
  /** Week-start (Monday) dateString — the row's identity. */
  weekStart: string;
  rowHeight: number;
  /** Day-cell width in px — drives the chip title wrap estimate. */
  cellWidth: number;
  /** Visible event slots per cell (from row height); ≤0 renders numbers only. */
  slotCount: number;
  /** Whether the overflow counter has to take the last slot, or fits in the
   *  space left beneath it (see month-grid). */
  counterNeedsSlot: boolean;
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
  /** A day to flash and a nonce that re-fires it; ignored unless the day falls
   *  in this week (see month-grid). */
  pulse: { day: string; nonce: number } | null;
  /** Show a day's full list. Tapping a cell asks for this — anywhere in it,
   *  events included, once the cell has more than it can show. Empty days
   *  have nothing to list, so the row never asks for one. */
  onOpenDay: (day: string) => void;
  /** Open the editor on a single event. */
  onPressEvent: (event: CalEvent) => void;
  /** Hold a cell to start a new event on that day. Armed everywhere in the
   *  cell, over its events included, so the gesture is the cell's and not the
   *  empty space's. */
  onCreateOnDay: (day: string) => void;
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

/** How long a hold must last to count as one. Stated here rather than left to
 *  Pressable's own default because the ink below is timed to it: the wash
 *  reaches full strength exactly as the hold fires, which is what makes the
 *  fill read as the gesture's progress rather than as decoration. */
const LONG_PRESS_MS = 350;
/** How long a touch must stay put before it counts as a press at all. The grid
 *  lives inside a scroller, and a scroll begins with a touch that looks exactly
 *  like a press — without this, every drag lit the ink under the finger before
 *  the list moved. Long enough to outlast a flick's first frames, short enough
 *  that a real press still feels immediate. */
const PRESS_DELAY_MS = 90;
/** How fast the ink clears once the finger lifts — quick, so a plain tap
 *  flashes rather than lingering. */
const INK_RELEASE_MS = 150;
/** How fast the ink reaches full strength. Short: the colour arrives at once,
 *  and it is the spreading circle, not the tint, that reports the hold. */
const INK_FADE_MS = 90;
/** The ink itself. Fixed rather than a palette token, for the same reason as
 *  the fills above: it has to read on the bare background, on a neighbouring
 *  month's grey AND on today's blue, and one value does all three — the dark
 *  scheme's link blue, light enough to lift even off TODAY_FILL. */
const INK_COLOR = '#5B9DFF';
/** The ink at full strength. */
const INK_OPACITY = 0.28;

/** A pulse is the same ink without a finger: it spreads from the cell's middle
 *  because there is no touch point to spread from, eases out rather than
 *  running linear (it reports nothing, so it has no progress to be honest
 *  about), holds long enough to be seen, and clears itself. */
const PULSE_GROW_MS = 320;
const PULSE_HOLD_MS = 700;
const PULSE_FADE_MS = 320;

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
  counterNeedsSlot,
  events,
  todayStr,
  focusedYear,
  focusedMonth0,
  isMonthStart,
  pulse,
  onOpenDay,
  onPressEvent,
  onCreateOnDay,
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

  // Ink: a circle spreading from the point touched until it has filled the
  // cell. One per row rather than one per cell, moved to whichever column is
  // under the finger — a press that starts on a chip or banner inks the cell
  // beneath it, which is the point: the gestures belong to the cell, so the
  // feedback has to as well.
  const inkCol = useSharedValue(-1);
  const inkX = useSharedValue(0);
  const inkY = useSharedValue(0);
  const inkGrow = useSharedValue(0);
  const inkFade = useSharedValue(0);
  // Reaches every corner of a cell from wherever the finger landed, so the
  // spread always ends with the cell full rather than with one corner missed.
  // The overspill is clipped away by the well around it.
  const inkRadius = Math.hypot(cellWidth, rowHeight);
  const pressIn = useCallback(
    (col: number, x: number, y: number) => {
      inkCol.value = col;
      inkX.value = Number.isFinite(x) ? x : cellWidth / 2;
      inkY.value = Number.isFinite(y) ? y : rowHeight / 2;
      // Starts as a dot rather than as nothing, so the touch registers on the
      // first frame. Linear from there, so how far the ink has spread is
      // honestly how much of the hold has elapsed — an eased spread looks
      // finished long before the press fires.
      inkGrow.value = 0.12;
      inkGrow.value = withTiming(1, {
        duration: LONG_PRESS_MS,
        easing: Easing.linear,
      });
      inkFade.value = withTiming(1, { duration: INK_FADE_MS });
    },
    [inkCol, inkX, inkY, inkGrow, inkFade, cellWidth, rowHeight]
  );
  const pressOut = useCallback(() => {
    inkFade.value = withTiming(0, { duration: INK_RELEASE_MS });
  }, [inkFade]);

  // Flash a day the app was sent to, so dismissing whatever opened over it
  // leaves you knowing which cell you came from. Keyed on the nonce, not the
  // day, so the same day can be flashed twice running.
  const pulseNonce = pulse?.nonce ?? null;
  const pulseDay = pulse?.day ?? null;
  useEffect(() => {
    if (pulseNonce === null || pulseDay === null) return;
    const col = days.findIndex((d) => toDateString(d) === pulseDay);
    if (col < 0) return;
    inkCol.value = col;
    inkX.value = cellWidth / 2;
    inkY.value = rowHeight / 2;
    inkGrow.value = 0.12;
    inkGrow.value = withTiming(1, {
      duration: PULSE_GROW_MS,
      easing: Easing.out(Easing.quad),
    });
    inkFade.value = withSequence(
      withTiming(1, { duration: INK_FADE_MS }),
      withDelay(PULSE_HOLD_MS, withTiming(0, { duration: PULSE_FADE_MS }))
    );
    // days/cellWidth/rowHeight are read at fire time and are stable for a
    // mounted row; the nonce is what makes this run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseNonce, pulseDay]);
  // The well is the cell's own box, clipping the circle inside it so the ink
  // never bleeds into the day next door.
  const inkWellStyle = useAnimatedStyle(() => ({
    left: inkCol.value * cellWidth,
    width: cellWidth,
    opacity: inkFade.value,
  }));
  const inkStyle = useAnimatedStyle(() => ({
    left: inkX.value - inkRadius,
    top: inkY.value - inkRadius,
    transform: [{ scale: inkGrow.value }],
  }));

  const layout = useMemo(() => {
    const chipSpan = (event: CalEvent) =>
      chipTitleLines(event.summary, cellWidth);
    const bannerRows = (event: CalEvent, spanCols: number) =>
      bannerTitleLines(event.summary, spanCols * cellWidth);
    return layoutWeek(
      days[0],
      events,
      slotCount,
      chipSpan,
      bannerRows,
      counterNeedsSlot
    );
  }, [days, events, slotCount, counterNeedsSlot, cellWidth]);

  const dayAt = useCallback((col: number) => toDateString(days[col]), [days]);

  /** Tap: the day's list. An empty day has no list, so it stays inert — the
   *  cell is still there to be held. */
  const openDay = useCallback(
    (col: number) => {
      const day = dayAt(col);
      if (daysWithEvents.has(day)) onOpenDay(day);
    },
    [dayAt, daysWithEvents, onOpenDay]
  );

  /** Hold: a new event on that day. */
  const createOn = useCallback(
    (col: number) => onCreateOnDay(dayAt(col)),
    [dayAt, onCreateOnDay]
  );

  /** Tap on an event. Once a cell holds more than it can show, its chips are
   *  an arbitrary few of the day's events and singling one out is misleading —
   *  so an overflowing cell answers every tap with the whole day's list, the
   *  only place the hidden ones can be reached. */
  const pressEvent = useCallback(
    (event: CalEvent, col: number) => {
      if (layout.overflow[col] > 0) openDay(col);
      else onPressEvent(event);
    },
    [layout, openDay, onPressEvent]
  );

  /** The column under the finger inside a banner, which may span several. Its
   *  box starts at its own first column, so the offset is measured from there.
   *  A banner is one bar but the day beneath it is still what is being
   *  pressed — holding the third day of a span creates on the third day. */
  const bannerCol = useCallback(
    (e: GestureResponderEvent, startCol: number, span: number) => {
      const x = e.nativeEvent.locationX;
      const offset =
        cellWidth > 0 && Number.isFinite(x) ? Math.floor(x / cellWidth) : 0;
      return startCol + Math.min(Math.max(offset, 0), span - 1);
    },
    [cellWidth]
  );

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
              onPress={() => openDay(col)}
              onLongPress={() => createOn(col)}
              onPressIn={(e) =>
                pressIn(col, e.nativeEvent.locationX, e.nativeEvent.locationY)
              }
              onPressOut={pressOut}
              delayLongPress={LONG_PRESS_MS}
              unstable_pressDelay={PRESS_DELAY_MS}
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
        {/* Last in the cells layer: over the fills and the day number, under
            the events — a chip pressed through stays crisp on top of it. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.inkWell, inkWellStyle]}
        >
          <Animated.View
            style={[
              styles.ink,
              {
                width: inkRadius * 2,
                height: inkRadius * 2,
                borderRadius: inkRadius,
              },
              inkStyle,
            ]}
          />
        </Animated.View>
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

      {/* box-none: empty-area presses fall through to the day cells. Chips and
          banners do capture their own pixels, but they carry the cell's two
          gestures themselves, so covering a strip of a cell costs it nothing.
          The overflow counter stays a plain label — no handlers to carry. */}
      <View style={styles.overlay}>
        {layout.banners.map((banner) => (
          <EventBanner
            key={banner.event.id}
            placement={banner}
            titleLines={banner.rows > 1 ? 2 : 1}
            onPress={(e) =>
              pressEvent(
                banner.event,
                bannerCol(e, banner.startCol, banner.span)
              )
            }
            onLongPress={(e) =>
              createOn(bannerCol(e, banner.startCol, banner.span))
            }
            onPressIn={(e) => {
              const col = bannerCol(e, banner.startCol, banner.span);
              pressIn(
                col,
                e.nativeEvent.locationX - (col - banner.startCol) * cellWidth,
                DAY_NUMBER_HEIGHT +
                  banner.slot * SLOT_HEIGHT +
                  e.nativeEvent.locationY
              );
            }}
            onPressOut={pressOut}
            delayLongPress={LONG_PRESS_MS}
            unstable_pressDelay={PRESS_DELAY_MS}
            style={{
              position: 'absolute',
              left: pct(banner.startCol),
              // left+right (not width) so the banner's own margins inset its
              // edges instead of shifting the whole bar sideways.
              right: pct(7 - banner.startCol - banner.span),
              top: banner.slot * SLOT_HEIGHT,
              // Fixed to the slots reserved, NOT to the lines that render.
              // Sizing to content looks tidier per strip and is wrong in
              // aggregate: the leftover of an over-granted strip turns into
              // gap, so the space between two events depended on how many
              // lines the one above happened to use. A constant gap is worth
              // more than a snug box, so the box gets the slack instead.
              height: banner.rows * SLOT_HEIGHT - EVENT_GAP,
            }}
          />
        ))}
        {layout.chips.map((chip) => (
          <EventChip
            key={chip.event.id}
            event={chip.event}
            titleLines={Math.min(2, chip.span)}
            onPress={() => pressEvent(chip.event, chip.col)}
            onLongPress={() => createOn(chip.col)}
            onPressIn={(e) =>
              pressIn(
                chip.col,
                e.nativeEvent.locationX,
                DAY_NUMBER_HEIGHT +
                  chip.slot * SLOT_HEIGHT +
                  e.nativeEvent.locationY
              )
            }
            onPressOut={pressOut}
            delayLongPress={LONG_PRESS_MS}
            unstable_pressDelay={PRESS_DELAY_MS}
            style={{
              position: 'absolute',
              left: pct(chip.col),
              width: pct(1),
              top: chip.slot * SLOT_HEIGHT,
              // Fixed to its slots, as for banners above — and the bar
              // stretches to it, so a one-line chip and a one-line banner
              // beside it still stand the same height.
              height: chip.span * SLOT_HEIGHT - EVENT_GAP,
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
                  height: COUNTER_HEIGHT,
                  justifyContent: 'center',
                  // Trailing corner: the day number holds the leading one, and
                  // every strip is left-aligned, so the count sits where
                  // nothing else in the cell does.
                  alignItems: 'flex-end',
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
  inkWell: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  ink: {
    position: 'absolute',
    backgroundColor: INK_COLOR,
    opacity: INK_OPACITY,
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
    // The same weight as the day number: both are the cell's own chrome
    // rather than one of its events, and they sit in opposite corners.
    fontWeight: '700',
    // Explicit, so the text centres in its box rather than inheriting a line
    // box taller than it and drifting low.
    lineHeight: 14,
    // Mirrors the day number's own inset on the other side, and clears the
    // cell's right-hand rule.
    paddingRight: 5,
  },
});
