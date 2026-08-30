import {
  forwardRef,
  memo,
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
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
  landingIndex,
  monthIndexIn,
  monthKey,
  weekStartOf,
  weeksOfMonth,
  type MonthAnchor,
} from '@/utils/calendar-grid';
import { parseDay, toDateString } from '@/utils/date';

export type MonthGridHandle = {
  /** Jump to (year, month0)'s page. Animated only for an adjacent month — a
   *  long glide outruns row mounting and shows empty rows on the way. */
  scrollToMonth: (year: number, month0: number, animated: boolean) => void;
};

type Props = {
  /** Measured grid pane size — the grid must only mount once these are known
   *  (defines page height AND sidesteps Android's initialScrollIndex-at-zero-height bug). */
  width: number;
  height: number;
  events: CalEvent[];
  /** Today's dateString; also anchors the ±5y month range. */
  today: string;
  /** Month to land on at mount (deep-linked day's month or today's). */
  initialMonth: MonthAnchor;
  /** The page the grid has moved to — drives the header label and the fetch. */
  onMonthChange: (anchor: MonthAnchor) => void;
  /** Fired once, when the initial month's page first becomes viewable — i.e.
   *  the grid is verifiably rendering at its landing position. */
  onAnchored: () => void;
  onPressDay: (day: string) => void;
  onPressEvent: (event: CalEvent) => void;
  onLongPressDay: (day: string) => void;
};

const NO_EVENTS: CalEvent[] = [];

/** Any sliver of the anchor page counts; fire without waiting for a gesture. */
const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 1,
  waitForInteraction: false,
};

/** The scroller's DOM node on web (RNW), null on native. */
function scrollerNode(list: FlatList<MonthAnchor> | null): HTMLElement | null {
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

type PageProps = {
  month: MonthAnchor;
  height: number;
  rowHeight: number;
  cellWidth: number;
  slotCount: number;
  weekEvents: Map<string, CalEvent[]>;
  today: string;
  onPressDay: (day: string) => void;
  onPressEvent: (event: CalEvent) => void;
  onLongPressDay: (day: string) => void;
};

/** One month = one page = six week rows filling the pane exactly. Days outside
 *  the page's own month dim, so a page reads the same wherever it is scrolled. */
const MonthPage = memo(function MonthPage({
  month,
  height,
  rowHeight,
  cellWidth,
  slotCount,
  weekEvents,
  today,
  onPressDay,
  onPressEvent,
  onLongPressDay,
}: PageProps) {
  const weeks = useMemo(() => weeksOfMonth(month), [month]);
  return (
    <View style={{ height }} testID={`month-page-${monthKey(month)}`}>
      {weeks.map((week) => (
        <WeekRow
          key={week}
          weekStart={week}
          rowHeight={rowHeight}
          cellWidth={cellWidth}
          slotCount={slotCount}
          events={weekEvents.get(week) ?? NO_EVENTS}
          todayStr={today}
          focusedYear={month.year}
          focusedMonth0={month.month0}
          onPressDay={onPressDay}
          onPressEvent={onPressEvent}
          onLongPressDay={onLongPressDay}
        />
      ))}
    </View>
  );
});

/**
 * The month grid: a paged FlatList of whole months spanning today ± 5 years.
 * One page fills the pane, so one swipe moves exactly one month — `pagingEnabled`
 * does it natively on Android and via CSS scroll-snap on web, and
 * `disableIntervalMomentum` stops a hard fling from carrying past the next page.
 * The page index is just the scroll offset over the page height, and the month
 * it names drives the header label and the fetch — nothing settles, eases, or
 * waits for idle. Each platform lands the gesture its own way: native measures
 * the drag against FLIP_FRACTION on release, web leaves it to the browser's
 * scroll-snap, hand-wired here because RNW cannot page a virtualized list on
 * its own and suspended across programmatic jumps (see setSnapping).
 */
export const MonthGrid = forwardRef<MonthGridHandle, Props>(function MonthGrid(
  {
    width,
    height,
    events,
    today,
    initialMonth,
    onMonthChange,
    onAnchored,
    onPressDay,
    onPressEvent,
    onLongPressDay,
  },
  ref
) {
  const listRef = useRef<FlatList<MonthAnchor>>(null);

  const months = useMemo(
    () => buildMonthRange(parseDay(today) ?? new Date()),
    [today]
  );

  const rowHeight = height / 6;
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
  /** The page a gesture started from — what the flip is measured against. */
  const dragFrom = useRef(initialIndex);
  /** True from the moment a user gesture starts until it has been landed. Our
   *  own programmatic scrolls never set it, which is what keeps them from
   *  being mistaken for a gesture and settled a second time. */
  const gesturing = useRef(false);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // The header follows the scroll live: the month is whichever page the
    // offset is nearest, with nothing to settle afterwards.
    const index = clampIndex(
      Math.round(e.nativeEvent.contentOffset.y / height)
    );
    if (index === currentIndex.current) return;
    currentIndex.current = index;
    onMonthChange(months[index]);
  };

  /** Note where a gesture began; its landing is measured from there. */
  const beginGesture = () => {
    if (gesturing.current) return;
    gesturing.current = true;
    dragFrom.current = currentIndex.current;
  };

  /** Land the gesture on its page. Shared by the native drag-end event and the
   *  web scroll-end signal, so both platforms settle by the same rule. */
  const settleTo = (offset: number, velocity: number) => {
    gesturing.current = false;
    const target = clampIndex(
      landingIndex(dragFrom.current, offset, height, velocity)
    );
    currentIndex.current = target;
    listRef.current?.scrollToOffset({
      offset: target * height,
      animated: true,
    });
    onMonthChange(months[target]);
  };

  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    settleTo(e.nativeEvent.contentOffset.y, e.nativeEvent.velocity?.y ?? 0);
  };

  // Web has no drag events a wheel can raise, so a gesture is recognised from
  // the input itself — a wheel notch or a finger going down — and landed when
  // the browser reports scrolling has stopped. Reading the input rather than
  // the scrolling is what distinguishes a gesture from our own glide, which
  // must never be settled again. `scrollend` is that stop signal where it
  // exists; older engines get a short idle timer. No velocity is available
  // either way, so on web the distance half of the rule carries it alone.
  const settleRef = useRef(settleTo);
  settleRef.current = settleTo;
  const beginRef = useRef(beginGesture);
  beginRef.current = beginGesture;
  useEffect(() => {
    const node = scrollerNode(listRef.current);
    if (!node) return;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const start = () => beginRef.current();
    const finish = () => {
      if (!gesturing.current) return;
      settleRef.current(node.scrollTop, 0);
    };
    // Cast so this reads as the runtime feature check it is: lib.dom
    // declares `onscrollend` unconditionally, so narrowing on `node`
    // itself would type the fallback branch as unreachable.
    const hasScrollEnd = 'onscrollend' in (node as object);
    const onScroll = () => {
      if (hasScrollEnd) return;
      if (idle) clearTimeout(idle);
      idle = setTimeout(finish, 120);
    };
    node.addEventListener('wheel', start, { passive: true });
    node.addEventListener('touchstart', start, { passive: true });
    if (hasScrollEnd) node.addEventListener('scrollend', finish);
    else node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (idle) clearTimeout(idle);
      node.removeEventListener('wheel', start);
      node.removeEventListener('touchstart', start);
      node.removeEventListener('scrollend', finish);
      node.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Anchored latch: report once, the first time the initial month's page is
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
    anchorContext.current = { key: monthKey(months[initialIndex]), onAnchored };
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
    listRef.current?.scrollToOffset({
      offset: initialIndex * height,
      animated: false,
    });
  };

  // Pane resize (rotation / window resize): the page height changed, so put
  // the current page back under the viewport.
  const prevHeight = useRef(height);
  useEffect(() => {
    if (prevHeight.current === height) return;
    prevHeight.current = height;
    listRef.current?.scrollToOffset({
      offset: currentIndex.current * height,
      animated: false,
    });
  }, [height]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToMonth(year, month0, animated) {
        const index = indexOfMonth({ year, month0 });
        const adjacent = Math.abs(index - currentIndex.current) <= 1;
        currentIndex.current = index;
        gesturing.current = false;
        listRef.current?.scrollToOffset({
          offset: index * height,
          animated: animated && adjacent,
        });
        onMonthChange(months[index]);
      },
    }),
    [indexOfMonth, height, months, onMonthChange]
  );

  const renderItem = ({ item }: ListRenderItemInfo<MonthAnchor>) => (
    <MonthPage
      month={item}
      height={height}
      rowHeight={rowHeight}
      cellWidth={width / 7}
      slotCount={slotCount}
      weekEvents={weekEvents}
      today={today}
      onPressDay={onPressDay}
      onPressEvent={onPressEvent}
      onLongPressDay={onLongPressDay}
    />
  );

  return (
    <FlatList
      ref={listRef}
      testID="month-grid"
      style={styles.list}
      data={months}
      renderItem={renderItem}
      keyExtractor={monthKey}
      getItemLayout={(_, index) => ({
        length: height,
        offset: height * index,
        index,
      })}
      initialScrollIndex={initialIndex}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      windowSize={3}
      // No pagingEnabled: its threshold is half a page and is not tunable, so
      // the drag handlers below decide instead. Zero deceleration means the
      // content stops dead under the finger on release, leaving that decision
      // — and the glide to the chosen month — entirely ours. Web keeps the
      // browser's scroll-snap and neither prop applies there.
      // Content stops dead under the finger on release, leaving the landing
      // decision — and the glide to it — entirely ours. Web has no momentum to
      // suppress and settles from the scroll-end effect above instead.
      decelerationRate={Platform.OS === 'web' ? undefined : 0}
      onScrollBeginDrag={Platform.OS === 'web' ? undefined : beginGesture}
      onScrollEndDrag={Platform.OS === 'web' ? undefined : handleScrollEndDrag}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={VIEWABILITY_CONFIG}
      scrollEventThrottle={16}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      onScrollToIndexFailed={({ index }) => {
        listRef.current?.scrollToOffset({
          offset: index * height,
          animated: false,
        });
      }}
      showsVerticalScrollIndicator={false}
    />
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
});
