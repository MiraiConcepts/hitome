import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
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
  EVENT_LINE_HEIGHT,
  EventBanner,
  EventChip,
  type EventLook,
} from '@/components/calendar/event-chip';
import {
  GRID_SCALE,
  RULE_WIDTH,
  scaled,
} from '@/components/calendar/grid-scale';
import { TodayMark } from '@/components/calendar/today-mark';
import { titleWidth as measureTitle } from '@/components/calendar/title-width';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  counterSpot,
  layoutWeek,
  weekendBoundaries,
} from '@/utils/calendar-grid';
import { eventDays, formatTime, parseDay, toDateString } from '@/utils/date';
import { dayCellLabel } from '@/utils/day-cell-label';

/** Height of one banner/chip slot inside a day cell: one line of event text
 *  (EVENT_LINE_HEIGHT), the dp the strip stands proud of it at each end, and
 *  the gap to the strip below — 14 + 2 + 4 (the line grows with GRID_SCALE
 *  on a wide web window; the ends and the gap do not).
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
export const SLOT_HEIGHT = EVENT_LINE_HEIGHT + 2 + Spacing.one;
/** Clear space between one strip and the next — the app's spacing unit, which
 *  is also what separates everything else in the UI. It comes out of the slot,
 *  so raising it makes strips shorter rather than pushing them apart. */
export const EVENT_GAP = Spacing.one;
/** Clearance under the overflow counter, which is anchored to the cell's
 *  bottom edge rather than laid into a slot. */
const MORE_BOTTOM_INSET = 2;
/** The counter's own box — its line, nothing more. */
const COUNTER_HEIGHT = scaled(14);
/** What the counter needs beneath the last strip to sit clear of it. Read by
 *  month-grid to decide whether a slot has to be surrendered for it. */
export const COUNTER_FOOTPRINT = COUNTER_HEIGHT + MORE_BOTTOM_INSET;

/** A wide window's cells have room to spare: the day number is set in from the
 *  corner by the digit's own ink, about 8px each way (the phone's is 6.5), not
 *  by its box (which carries padding, and centres a single digit in a wider
 *  space). */
const WIDE = GRID_SCALE > 1;
/** Height of the day-number line at the top of each cell — the number's own
 *  box plus the gap that holds the first event off it. */
export const DAY_NUMBER_HEIGHT = scaled(24);

type WeekRowProps = {
  /** Week-start (Monday) dateString — the row's identity. */
  weekStart: string;
  rowHeight: number;
  /** Day-cell width in px — drives the chip title wrap estimate. */
  cellWidth: number;
  /** Visible event slots per cell (from row height); ≤0 renders numbers only,
   *  with a busy day's "+N" beside its number. */
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
  /** How each event is drawn (discover mode); every one `normal` without. */
  eventLook?: (event: CalEvent) => EventLook;
  /** A hold on an event, before the cell's own hold: true when it took the
   *  hold (discover mode opens the event's page), so no event is created. */
  onHoldEvent?: (event: CalEvent) => boolean;
  /** Discover mode is on: today's fill turns orange. */
  discover?: boolean;
};

/** How far a multi-day event's trail fades toward the ground by its last
 *  day in the row: most of the way, so the end is still there to see. */
const TRAIL_END = 0.8;

/**
 * A multi-day event's piece on day `col`. Its first day in the row carries
 * the title on the full colour (so a run into a new week names itself
 * again); the later days carry no title and share one fade, each day
 * taking its stretch, so the run reads as one bar trailing off.
 */
function trailOf(
  startCol: number,
  span: number,
  col: number
): { from: number; to: number } | undefined {
  const step = col - startCol;
  if (step === 0) return undefined;
  const later = span - 1;
  return {
    from: ((step - 1) / later) * TRAIL_END,
    to: (step / later) * TRAIL_END,
  };
}

/** Web only (react-native-web reads `dataSet`, global.css the attribute); the
 *  spread keeps the native Pressable's props type from objecting. */
const DAY_CELL_DATA = { dataSet: { focusRing: 'none' } };

const pct = (n: number) => `${(n / 7) * 100}%` as const;

// Chip title wrap: slot layout runs before text renders, so whether a title
// fits on one line is worked out ahead of it (title-width.ts). Measured on
// the web: estimated, a title that fits got a two-line strip with one line in
// it at widths inside the estimate's margin, which a resized window swept
// straight through.
/** Horizontal chrome inside a chip: 4px stand-off + 3px bar + 3px gap + 3px
 *  right padding. */
const CHIP_CHROME_PX = 13;
/** Horizontal chrome inside a banner: 4px padding each side + hairline. */
const BANNER_CHROME_PX = 9;

const titleWidth = (title: string) => measureTitle(title, EVENT_FONT_SIZE);

/** Title lines a chip needs against the full cell width (time, when shown,
 *  sits on its own line and never competes with the title). */
function chipTitleLines(summary: string, cellWidth: number): number {
  return titleWidth(summary || '(untitled)') > cellWidth - CHIP_CHROME_PX
    ? 2
    : 1;
}

/** From this cell width a timed event shows its start time above its title
 *  (a desktop window, and the month picture); a phone's cells have no room
 *  for the extra line. */
const TIME_MIN_CELL_WIDTH = 140;

/** Slots a timed event takes: its title lines, and the time's line where the
 *  cells show times. */
function chipSlots(summary: string, cellWidth: number): number {
  return (
    chipTitleLines(summary, cellWidth) +
    (cellWidth >= TIME_MIN_CELL_WIDTH ? 1 : 0)
  );
}

/** Title lines a banner needs over its full width. */
function bannerTitleLines(summary: string, widthPx: number): number {
  return titleWidth(summary || '(untitled)') > widthPx - BANNER_CHROME_PX
    ? 2
    : 1;
}

// Cell fills, solid rather than translucent washes so each cell renders
// exactly its stated color whatever sits behind it. A neighbouring month's
// days are shaded; every other day, weekend included, is left to the
// screen's background (today's is filled, see TodayMark).
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
/** How long a press on an event lasts before the day's ink starts. A tap
 *  opens the event, and lights the event; only a press held past this is
 *  turning into a hold, which creates on the day, so only then does the day
 *  ink — the rest of LONG_PRESS_MS, so it still fills as the hold fires. */
const EVENT_INK_DELAY_MS = 150;
/** The ink itself. Fixed rather than a palette token, for the same reason as
 *  the fills above: it has to read on the bare background, on a neighbouring
 *  month's grey AND on today's blue, and one value does all three — the dark
 *  scheme's link blue, light enough to lift even off a blue event. */
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

// Grid rules — every line in the grid.
//
// Opaque and whole pixels wide (RULE_WIDTH), both deliberately, so every
// line renders identically. A translucent rule composites with the cell wash behind it, and
// a hairline lands on a fractional device pixel — row height is the pane over
// six — so it is drawn at partial coverage and blends with that wash anyway.
// Either alone leaves the lines visibly disagreeing across plain, weekend,
// today and out-of-month cells; together they cover whole pixels in one flat
// color. One value serves both schemes: a mid grey reads against either
// background, so there is nothing left for the scheme to decide.
export const GRID_RULE = '#60646C';

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
  eventLook,
  onHoldEvent,
  discover,
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
  // Counted, not only marked: a screen reader hears how many each day holds
  // (the "+N" counter is drawn for the eye only).
  const daysWithEvents = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      for (const day of eventDays(event.start, event.end))
        counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
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
  // under the finger — a press held on a chip or banner inks the cell beneath
  // it, because the hold creates on that day; a tap on one lights the event
  // instead (event-chip), since the tap opens the event.
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
    (col: number, x: number, y: number, growMs: number = LONG_PRESS_MS) => {
      inkCol.value = col;
      inkX.value = Number.isFinite(x) ? x : cellWidth / 2;
      inkY.value = Number.isFinite(y) ? y : rowHeight / 2;
      // Starts as a dot rather than as nothing, so the touch registers on the
      // first frame. Linear from there, so how far the ink has spread is
      // honestly how much of the hold has elapsed — an eased spread looks
      // finished long before the press fires.
      inkGrow.value = 0.12;
      inkGrow.value = withTiming(1, {
        duration: growMs,
        easing: Easing.linear,
      });
      inkFade.value = withTiming(1, { duration: INK_FADE_MS });
    },
    [inkCol, inkX, inkY, inkGrow, inkFade, cellWidth, rowHeight]
  );
  const pressOut = useCallback(() => {
    inkFade.value = withTiming(0, { duration: INK_RELEASE_MS });
  }, [inkFade]);

  // An event's press: the cell's ink, held back until the press outlasts a
  // tap (see EVENT_INK_DELAY_MS).
  const eventInk = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressInEvent = useCallback(
    (col: number, x: number, y: number) => {
      if (eventInk.current) clearTimeout(eventInk.current);
      eventInk.current = setTimeout(
        () => pressIn(col, x, y, LONG_PRESS_MS - EVENT_INK_DELAY_MS),
        EVENT_INK_DELAY_MS
      );
    },
    [pressIn]
  );
  const pressOutEvent = useCallback(() => {
    if (eventInk.current) clearTimeout(eventInk.current);
    eventInk.current = null;
    pressOut();
  }, [pressOut]);
  useEffect(
    () => () => {
      if (eventInk.current) clearTimeout(eventInk.current);
    },
    []
  );

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

  // Where the weekend split falls (by the week start), for the rule and the
  // bars that end against it.
  const splits = weekendBoundaries();
  const showTimes = cellWidth >= TIME_MIN_CELL_WIDTH;

  const layout = useMemo(() => {
    const chipSpan = (event: CalEvent) => chipSlots(event.summary, cellWidth);
    // Each day's piece carries the title (see the cells below), so it wraps
    // to one day's width, not the span's.
    const bannerRows = (event: CalEvent) =>
      bannerTitleLines(event.summary, cellWidth);
    return layoutWeek(
      days[0],
      events,
      slotCount,
      chipSpan,
      bannerRows,
      counterNeedsSlot,
      eventLook && ((event) => eventLook(event) === 'going')
    );
  }, [days, events, slotCount, counterNeedsSlot, cellWidth, eventLook]);

  const dayAt = useCallback((col: number) => toDateString(days[col]), [days]);
  const todayCol = days.findIndex((d) => toDateString(d) === todayStr);

  /** Tap: the day's list. An empty day has no list, so a tap there starts a
   *  new event on it, on the phone as on the web (a hold does the same, on a
   *  day with events too). */
  const openDay = useCallback(
    (col: number) => {
      const day = dayAt(col);
      if (daysWithEvents.has(day)) onOpenDay(day);
      else onCreateOnDay(day);
    },
    [dayAt, daysWithEvents, onOpenDay, onCreateOnDay]
  );

  /** Hold: a new event on that day. */
  const createOn = useCallback(
    (col: number) => onCreateOnDay(dayAt(col)),
    [dayAt, onCreateOnDay]
  );

  /** A hold reaching its threshold. On a phone that is the gesture: the
   *  editor rises under the finger. With a mouse, the hold only arms it —
   *  the ink stays full — and letting go is what creates, as a click acts on
   *  release; a cancelled pointer (the browser taking the gesture) creates
   *  nothing. */
  const holdOn = useCallback(
    (col: number) => {
      if (Platform.OS !== 'web') {
        createOn(col);
        return;
      }
      const finish = (create: boolean) => () => {
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        if (create) createOn(col);
      };
      const onUp = finish(true);
      const onCancel = finish(false);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [createOn]
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

  // What each day draws: the piece of every all-day or multi-day event
  // crossing it, its own timed events, and how many did not fit.
  const byCol = useMemo(
    () =>
      days.map((_, col) => ({
        banners: layout.banners.filter(
          (b) => col >= b.startCol && col < b.startCol + b.span
        ),
        chips: layout.chips.filter((c) => c.col === col),
        overflow: layout.overflow[col],
      })),
    [days, layout]
  );

  /** A press going down on an event: the cell's ink (delayed), from where
   *  the finger is in the cell. */
  const eventPressIn = useCallback(
    (col: number, slot: number, e: GestureResponderEvent) =>
      pressInEvent(
        col,
        e.nativeEvent.locationX,
        DAY_NUMBER_HEIGHT + slot * SLOT_HEIGHT + e.nativeEvent.locationY
      ),
    [pressInEvent]
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
        {todayCol >= 0 && (
          <TodayMark
            discover={discover ?? false}
            style={[styles.todayFill, { left: pct(todayCol) }]}
          />
        )}
        {/* Under the cells: over the fills, under the day number and the
            events, so a chip pressed through stays crisp on top of it. */}
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
        {days.map((day, col) => {
          const dateString = toDateString(day);
          const isToday = dateString === todayStr;
          const inMonth =
            day.getFullYear() === focusedYear &&
            day.getMonth() === focusedMonth0;
          // Today keeps a month's weight and ink wherever it sits, so it
          // reads as today even from a neighbouring month's grid.
          const muted = !isToday && !inMonth;
          const label =
            day.getDate() === 1
              ? `1 ${day.toLocaleDateString(undefined, { month: 'short' })}`
              : `${day.getDate()}`;
          // The weekend split is this day's own right-hand rule, in orange.
          const beforeSplit = splits.includes(col + 1);
          const own = byCol[col];
          return (
            <Pressable
              key={dateString}
              testID={`day-cell-${dateString}`}
              // No keyboard ring: focus returns here when a day list or editor
              // closes, and a frame round the day read as a leftover.
              {...DAY_CELL_DATA}
              // A screen reader names the whole date, today and the day's
              // count, and offers the hold (add an event) as an action of its
              // own.
              accessibilityRole="button"
              accessibilityLabel={dayCellLabel(day, {
                isToday,
                count: daysWithEvents.get(dateString) ?? 0,
                currentYear: Number(todayStr.slice(0, 4)),
              })}
              accessibilityActions={[
                { name: 'longpress', label: 'Add an event' },
              ]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'longpress') createOn(col);
              }}
              onPress={() => openDay(col)}
              onLongPress={() => holdOn(col)}
              onPressIn={(e) =>
                pressIn(col, e.nativeEvent.locationX, e.nativeEvent.locationY)
              }
              onPressOut={pressOut}
              delayLongPress={LONG_PRESS_MS}
              unstable_pressDelay={PRESS_DELAY_MS}
              // A mouse over the grid lights it from grid-spotlight.web.ts,
              // a glow that follows the pointer across the cells.
              style={[
                styles.cell,
                col < 6 && styles.cellRule,
                beforeSplit && styles.cellSplit,
              ]}
            >
              {beforeSplit && <View style={styles.splitBridge} />}
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
              {/* The day's events, inside its own box: placed over the row
                  instead, the strips and the boxes rounded to pixels apart
                  and strips covered the lines between days. An event over
                  several days draws a piece in each (see trailOf). Each
                  carries the cell's two gestures itself; the box-none layer
                  lets a press between them reach the cell. */}
              <View style={styles.events}>
                {own.banners.map((banner) => (
                  <EventBanner
                    key={banner.event.id}
                    placement={banner}
                    titleLines={banner.rows > 1 ? 2 : 1}
                    fade={trailOf(banner.startCol, banner.span, col)}
                    onPress={() => pressEvent(banner.event, col)}
                    look={eventLook?.(banner.event)}
                    onLongPress={() => {
                      if (onHoldEvent?.(banner.event)) return;
                      holdOn(col);
                    }}
                    onPressIn={(e) => eventPressIn(col, banner.slot, e)}
                    onPressOut={pressOutEvent}
                    delayLongPress={LONG_PRESS_MS}
                    unstable_pressDelay={PRESS_DELAY_MS}
                    style={[
                      styles.strip,
                      {
                        top: banner.slot * SLOT_HEIGHT,
                        // Fixed to the slots reserved, NOT to the lines that
                        // render. Sizing to content looks tidier per strip
                        // and is wrong in aggregate: the leftover of an
                        // over-granted strip turns into gap, so the space
                        // between two events depended on how many lines the
                        // one above happened to use. A constant gap is worth
                        // more than a snug box, so the box gets the slack.
                        height: banner.rows * SLOT_HEIGHT - EVENT_GAP,
                      },
                    ]}
                  />
                ))}
                {own.chips.map((chip) => (
                  <EventChip
                    key={chip.event.id}
                    event={chip.event}
                    {...(showTimes
                      ? {
                          time: formatTime(chip.event.start),
                          // The time takes the first slot; one slot left
                          // holds both.
                          titleLines: chip.span - 1,
                        }
                      : { titleLines: Math.min(2, chip.span) })}
                    look={eventLook?.(chip.event)}
                    onPress={() => pressEvent(chip.event, col)}
                    onLongPress={() => {
                      if (onHoldEvent?.(chip.event)) return;
                      holdOn(col);
                    }}
                    onPressIn={(e) => eventPressIn(col, chip.slot, e)}
                    onPressOut={pressOutEvent}
                    delayLongPress={LONG_PRESS_MS}
                    unstable_pressDelay={PRESS_DELAY_MS}
                    style={[
                      styles.strip,
                      {
                        top: chip.slot * SLOT_HEIGHT,
                        // Fixed to its slots, as for banners above — and the
                        // bar stretches to it, so a one-line chip and a
                        // one-line banner beside it stand the same height.
                        height: chip.span * SLOT_HEIGHT - EVENT_GAP,
                      },
                    ]}
                  />
                ))}
              </View>
              {own.overflow > 0 ? (
                // A label, not a target: the cell owns both the tap and the
                // long press, so the counter must not swallow either. Hidden
                // from screen readers, which hear the count in the cell's
                // own name instead.
                <View
                  testID={`more-${dateString}`}
                  pointerEvents="none"
                  aria-hidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.moreBox,
                    counterSpot(slotCount) === 'bottom'
                      ? { bottom: MORE_BOTTOM_INSET, height: COUNTER_HEIGHT }
                      : styles.moreBesideDayNumber,
                  ]}
                >
                  <ThemedText numberOfLines={1} style={styles.more}>
                    +{own.overflow}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
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
  /** Behind today's cell, over a neighbouring month's shading. */
  todayFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: pct(1),
  },
  monthFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: OTHER_MONTH_FILL,
  },
  // Exactly a seventh each, not `flex: 1`: with flex, the six cells that
  // carry a rule counted it before the space was shared out, so each came
  // out a pixel wider and Sunday narrower.
  cell: {
    width: pct(1),
    paddingTop: WIDE ? 4 : 2,
    alignItems: 'flex-start',
  },
  cellRule: {
    borderRightWidth: RULE_WIDTH,
    borderRightColor: GRID_RULE,
  },
  dayNumberWrap: WIDE
    ? {
        // Left-aligned, no padding: the box hugs the digits. The line box's
        // own air above the capitals is part of the top inset.
        marginLeft: 8,
        alignItems: 'flex-start',
      }
    : {
        minWidth: DAY_NUMBER_HEIGHT - 4,
        paddingHorizontal: Spacing.one,
        marginLeft: 2,
        alignItems: 'center',
      },
  dayNumber: {
    fontSize: scaled(14),
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
  /** The weekend split: the day before it draws its rule in orange. */
  cellSplit: {
    borderRightColor: AccentColor,
  },
  /** The split's dot in the row's top rule, so it reads as one continuous
   *  line down the grid rather than broken grey at every week. */
  splitBridge: {
    position: 'absolute',
    top: -RULE_WIDTH,
    right: -RULE_WIDTH,
    width: RULE_WIDTH,
    height: RULE_WIDTH,
    backgroundColor: AccentColor,
  },
  /** Inside the cell's border, under the day number. */
  events: {
    position: 'absolute',
    top: DAY_NUMBER_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
  /** A chip or a day's piece of a banner: the cell's width, edge to edge
   *  inside its rules. */
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  moreBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
    // Trailing corner: the day number holds the leading one, and every strip
    // is left-aligned, so the count sits where nothing else in the cell does.
    alignItems: 'flex-end',
  },
  /** No slot under the day number: the counter shares its line instead, in
   *  the opposite corner, set down by the cell's top inset. */
  moreBesideDayNumber: {
    top: WIDE ? 4 : 2,
    // The day number's line (the `small` type's).
    height: 20,
  },
  more: {
    // The event strips' own size: one step for the grid's small type.
    fontSize: EVENT_FONT_SIZE,
    // The same weight as the day number: both are the cell's own chrome
    // rather than one of its events, and they sit in opposite corners.
    fontWeight: '700',
    // Explicit, so the text centres in its box rather than inheriting a line
    // box taller than it and drifting low.
    lineHeight: COUNTER_HEIGHT,
    // Mirrors the day number's own inset on the other side, and clears the
    // cell's right-hand rule.
    paddingRight: 5,
  },
});
