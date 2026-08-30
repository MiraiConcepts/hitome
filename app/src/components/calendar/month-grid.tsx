import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
  type ViewToken,
} from 'react-native';

import type { CalEvent } from '@/caldav/types';
import {
  DAY_NUMBER_HEIGHT,
  SLOT_HEIGHT,
  WeekRow,
} from '@/components/calendar/week-row';
import {
  addDays,
  buildMonthRange,
  buildWeekRange,
  landingIndex,
  monthIndexIn,
  monthStartWeekIndices,
  nearestSnapIndex,
  weekStartOf,
  type MonthAnchor,
} from '@/utils/calendar-grid';
import { parseDay, toDateString } from '@/utils/date';

export type MonthGridHandle = {
  /** Jump to (year, month0)'s row. Animated only for an adjacent month — a
   *  long glide outruns row mounting and shows empty rows on the way. */
  scrollToMonth: (year: number, month0: number, animated: boolean) => void;
};

type Props = {
  /** Measured grid pane size — the grid must only mount once these are known
   *  (defines row height AND sidesteps Android's initialScrollIndex-at-zero-height bug). */
  width: number;
  height: number;
  events: CalEvent[];
  /** Today's dateString; also anchors the ±5y month range. */
  today: string;
  /** Month to land on at mount (deep-linked day's month or today's). */
  initialMonth: MonthAnchor;
  /** The settled month — days outside it render dimmed. Held for the whole
   *  drag so the grid never reshades under the finger; it flips once, on
   *  landing, which is why this is the settled month and not the live one. */
  focusedMonth: MonthAnchor;
  /** The month the scroll position currently reads as — drives the header
   *  label, live, with nothing to settle first. */
  onMonthChange: (anchor: MonthAnchor) => void;
  /** Fired once scrolling has stopped — drives the dimming and the fetch, so
   *  a fling across several months costs one fetch rather than one per month. */
  onMonthSettled: (anchor: MonthAnchor) => void;
  /** Fired once, when the initial month's row first becomes viewable — i.e.
   *  the grid is verifiably rendering at its landing position. */
  onAnchored: () => void;
  onPressDay: (day: string) => void;
  onPressEvent: (event: CalEvent) => void;
  onLongPressDay: (day: string) => void;
};

const NO_EVENTS: CalEvent[] = [];

/** Any sliver of the anchor row counts; fire without waiting for a gesture. */
const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 1,
  waitForInteraction: false,
};

/** Quiet time before a scroll position counts as settled. Both platforms use
 *  it: Android's own drag-end lands the month, but nothing reports the end of
 *  the glide that follows, and web has no drag events at all. */
const SETTLE_MS = 150;

/**
 * How web pages by month. RNW forwards unknown camelCase styles straight to
 * CSS, and CSS creates a snap position only at an element that declares an
 * alignment — so aligning month-start rows ALONE quantizes scrolling to
 * months. (RNW's own `pagingEnabled` aligns every child, which on a ribbon of
 * weeks would snap per week; it is deliberately not used.) Handing this to the
 * browser also covers the scroll sources JS never saw — keyboard, scrollbar,
 * find-in-page — which used to leave the grid parked between months.
 */
const WEB_SNAP_TYPE = 'y mandatory';
const WEB_SNAP_CONTAINER =
  Platform.OS === 'web'
    ? ({ scrollSnapType: WEB_SNAP_TYPE } as unknown as ViewStyle)
    : null;

/** Long enough for a jump's destination rows to mount before snapping is
 *  handed back to the browser (see `jumpTo`). */
const SNAP_RESTORE_MS = 300;

/** The scroller's DOM node on web (RNW), null on native. */
function scrollerNode(list: FlatList<string> | null): HTMLElement | null {
  if (Platform.OS !== 'web' || !list) return null;
  return (list.getScrollableNode() as HTMLElement | null) ?? null;
}

/** Defensive cap on the week walk for one event — a malformed far-future end
 *  must not spin. Two years of weeks is far past any real grid event. */
const MAX_EVENT_WEEKS = 104;

/** Bucket events by the week rows they touch, keyed by week-start dateString. */
function bucketByWeek(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const event of events) {
    const lastMs = Math.max(event.start.getTime(), event.end.getTime() - 1);
    const last = weekStartOf(new Date(lastMs)).getTime();
    let cursor = weekStartOf(event.start);
    for (let i = 0; cursor.getTime() <= last && i < MAX_EVENT_WEEKS; i++) {
      const key = toDateString(cursor);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
      cursor = addDays(cursor, 7);
    }
  }
  return map;
}

const keyExtractor = (week: string) => week;

/**
 * The month grid: one continuous ribbon of week rows spanning today ± 5 years.
 * Weeks — not months — are the list unit, because a month's own six rows always
 * overrun into the next month's six by one or two, and two month-sized pages
 * would each have to draw that shared week. One row per week means no week can
 * be drawn twice, at any scroll position, including a drag held still.
 *
 * One swipe is still one month: the months a scroll can land on are rows
 * `monthStartWeekIndices` names, four or five rows apart. Android measures the
 * drag against those offsets on release (FLIP_FRACTION, in calendar-grid);
 * web declares them to the browser as CSS scroll-snap positions and lets it
 * page natively. The header follows the nearest of those offsets live, while
 * the dimming waits for the scroll to stop — see `focusedMonth`.
 */
export const MonthGrid = forwardRef<MonthGridHandle, Props>(function MonthGrid(
  {
    width,
    height,
    events,
    today,
    initialMonth,
    focusedMonth,
    onMonthChange,
    onMonthSettled,
    onAnchored,
    onPressDay,
    onPressEvent,
    onLongPressDay,
  },
  ref
) {
  const listRef = useRef<FlatList<string>>(null);

  const months = useMemo(
    () => buildMonthRange(parseDay(today) ?? new Date()),
    [today]
  );
  const { rangeStart, weeks } = useMemo(() => buildWeekRange(months), [months]);
  /** Row index per month, index-parallel to `months`. */
  const snapRows = useMemo(
    () => monthStartWeekIndices(months, rangeStart),
    [months, rangeStart]
  );
  /** The same rows as a lookup — what marks a row as web's snap target. */
  const monthStartRows = useMemo(() => new Set(snapRows), [snapRows]);

  const rowHeight = height / 6;
  const snapOffsets = useMemo(
    () => snapRows.map((row) => row * rowHeight),
    [snapRows, rowHeight]
  );
  const slotCount = Math.max(
    0,
    Math.floor((rowHeight - DAY_NUMBER_HEIGHT - 2) / SLOT_HEIGHT)
  );

  const clampIndex = useCallback(
    (index: number) => Math.min(Math.max(index, 0), months.length - 1),
    [months.length]
  );

  const indexOfMonth = useCallback(
    (anchor: MonthAnchor) => clampIndex(monthIndexIn(months[0], anchor)),
    [clampIndex, months]
  );

  // Map identity changes per fetch, so mounted rows re-render exactly when
  // data does.
  const weekEvents = useMemo(() => bucketByWeek(events), [events]);

  const initialIndex = indexOfMonth(initialMonth);
  const currentIndex = useRef(initialIndex);
  /** The month a gesture started from — what the flip is measured against. */
  const dragFrom = useRef(initialIndex);
  // Settle latch. The month is reported once the scroll has been quiet for
  // SETTLE_MS — after the drag, after the glide, and after a browser snap
  // alike. Read through a ref so a pending timer never fires a stale month.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleContext = useRef({ months, onMonthSettled });
  settleContext.current = { months, onMonthSettled };
  const armSettle = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      const ctx = settleContext.current;
      ctx.onMonthSettled(ctx.months[currentIndex.current]);
    }, SETTLE_MS);
  }, []);
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  // Every programmatic scroll goes through here.
  //
  // On web the browser owns snapping, and it re-snaps a programmatic jump the
  // moment it lands. Under virtualization the destination row is not mounted
  // yet, so mandatory snap has nothing to snap to there and pulls the scroll
  // back to the nearest row that IS mounted — a Today jump four months back
  // stopped two months short, on a month nobody asked for. Snapping is
  // therefore suspended for the jump and handed back once the destination has
  // had time to mount. Inert on native, where the JS settle does the landing.
  const snapRestore = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpTo = useCallback((offset: number, animated: boolean) => {
    const node = scrollerNode(listRef.current);
    if (node) {
      node.style.scrollSnapType = 'none';
      if (snapRestore.current) clearTimeout(snapRestore.current);
      snapRestore.current = setTimeout(() => {
        snapRestore.current = null;
        const restored = scrollerNode(listRef.current);
        if (restored) restored.style.scrollSnapType = WEB_SNAP_TYPE;
      }, SNAP_RESTORE_MS);
    }
    listRef.current?.scrollToOffset({ offset, animated });
  }, []);
  useEffect(
    () => () => {
      if (snapRestore.current) clearTimeout(snapRestore.current);
    },
    []
  );

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    armSettle();
    // The header follows the scroll live: the month is whichever one the
    // offset is nearest, with nothing to settle afterwards.
    const index = nearestSnapIndex(snapOffsets, e.nativeEvent.contentOffset.y);
    if (index === currentIndex.current) return;
    currentIndex.current = index;
    onMonthChange(months[index]);
  };

  /** Note where a gesture began; its landing is measured from there. Only a
   *  real drag reaches this — the platform raises it for nothing else. */
  const beginGesture = () => {
    dragFrom.current = currentIndex.current;
  };

  /** Land the drag on its month. Android only — web is snapped by the browser
   *  from WEB_SNAP_CONTAINER, and RNW raises no drag events to run this from. */
  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const target = clampIndex(
      landingIndex(
        dragFrom.current,
        e.nativeEvent.contentOffset.y,
        snapOffsets,
        e.nativeEvent.velocity?.y ?? 0
      )
    );
    currentIndex.current = target;
    jumpTo(snapOffsets[target], true);
    onMonthChange(months[target]);
  };

  // Anchored latch: report once, the first time the initial month's row is
  // viewable at the landing position — the parent keeps the grid area covered
  // until then. Viewability recomputes on cell layout and list updates, not
  // just user scrolls, so this fires shortly after mount. The callback must
  // keep a stable identity (the list rejects a changing onViewableItemsChanged),
  // so it reads the moving parts from a ref.
  const anchoredFired = useRef(false);
  const anchorContext = useRef<{ key: string; onAnchored: () => void } | null>(
    null
  );
  useEffect(() => {
    anchorContext.current = {
      key: weeks[snapRows[initialIndex]],
      onAnchored,
    };
  });
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const ctx = anchorContext.current;
      if (anchoredFired.current || !ctx) return;
      if (viewableItems.some((token) => token.key === ctx.key)) {
        anchoredFired.current = true;
        ctx.onAnchored();
      }
    },
    []
  );

  // Android hardening: initialScrollIndex can land at 0 in edge cases; one
  // idempotent post-mount jump to the intended offset costs nothing when it
  // already worked.
  const corrected = useRef(false);
  const handleContentSizeChange = () => {
    if (corrected.current) return;
    corrected.current = true;
    jumpTo(snapOffsets[initialIndex], false);
  };

  // Pane resize (rotation / window resize): the row height changed, so put the
  // current month back under the viewport.
  const prevHeight = useRef(height);
  useEffect(() => {
    if (prevHeight.current === height) return;
    prevHeight.current = height;
    jumpTo(snapOffsets[currentIndex.current], false);
  }, [height, snapOffsets, jumpTo]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToMonth(year, month0, animated) {
        const index = indexOfMonth({ year, month0 });
        const adjacent = Math.abs(index - currentIndex.current) <= 1;
        currentIndex.current = index;
        jumpTo(snapOffsets[index], animated && adjacent);
        // An explicit jump knows its destination synchronously, so it reports
        // it rather than waiting to be told by the scroll. Leaving this to the
        // settle timer made Today a coin flip: the fetch and the dimming hang
        // off the settle, and a programmatic scroll does not reliably emit the
        // scroll events that arm it — Today landed on the right month with
        // every day dimmed and not one event fetched for it.
        onMonthChange(months[index]);
        onMonthSettled(months[index]);
      },
    }),
    [indexOfMonth, snapOffsets, months, onMonthChange, onMonthSettled, jumpTo]
  );

  // FlatList treats its cells as pure: they re-render when `data` or
  // `extraData` changes and not otherwise. Both of the things a mounted row
  // draws from live outside `data` — which month is focused (dimming) and the
  // fetched events — so without this a row mounted before a jump keeps the
  // focus and the chips it first rendered with. Pressing Today four months
  // back landed on the right month with every day dimmed and no events on it.
  const extraData = useMemo(
    () => ({ focusedMonth, weekEvents }),
    [focusedMonth, weekEvents]
  );

  const renderItem = ({ item, index }: ListRenderItemInfo<string>) => (
    <WeekRow
      weekStart={item}
      rowHeight={rowHeight}
      cellWidth={width / 7}
      slotCount={slotCount}
      events={weekEvents.get(item) ?? NO_EVENTS}
      todayStr={today}
      focusedYear={focusedMonth.year}
      focusedMonth0={focusedMonth.month0}
      isMonthStart={monthStartRows.has(index)}
      onPressDay={onPressDay}
      onPressEvent={onPressEvent}
      onLongPressDay={onLongPressDay}
    />
  );

  return (
    <FlatList
      ref={listRef}
      testID="month-grid"
      style={[styles.list, WEB_SNAP_CONTAINER]}
      data={weeks}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={extraData}
      getItemLayout={(_, index) => ({
        length: rowHeight,
        offset: rowHeight * index,
        index,
      })}
      initialScrollIndex={snapRows[initialIndex]}
      initialNumToRender={8}
      windowSize={7}
      // No pagingEnabled: its threshold is half a page and is not tunable, so
      // handleScrollEndDrag decides instead. Zero deceleration means the
      // content stops dead under the finger on release, leaving that decision
      // — and the glide to the chosen month — entirely ours. Web has no
      // momentum to suppress and is snapped by the browser instead.
      decelerationRate={Platform.OS === 'web' ? undefined : 0}
      onScrollBeginDrag={Platform.OS === 'web' ? undefined : beginGesture}
      onScrollEndDrag={Platform.OS === 'web' ? undefined : handleScrollEndDrag}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={VIEWABILITY_CONFIG}
      scrollEventThrottle={16}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      onScrollToIndexFailed={({ index }) => jumpTo(index * rowHeight, false)}
      showsVerticalScrollIndicator={false}
    />
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
});
