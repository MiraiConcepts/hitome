import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { runAlarmReconcile } from '@/alarms/runner';
import { restoreEvent } from '@/caldav/events';
import type { CalEvent } from '@/caldav/types';
import { DayPopover } from '@/components/calendar/day-popover';
import {
  EventEditor,
  type EditorResult,
} from '@/components/calendar/event-editor';
import {
  MonthGrid,
  type MonthGridHandle,
} from '@/components/calendar/month-grid';
import { HEADER_GROUND, MonthHeader } from '@/components/calendar/month-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { davConfigured } from '@/config';
import { AccentColor, Colors, Spacing } from '@/constants/theme';
import { useMonthEvents } from '@/hooks/use-month-events';
import type { MonthAnchor } from '@/utils/calendar-grid';
import { eventDays, parseDay, toDateString } from '@/utils/date';
import { refreshAgendaWidget } from '@/widget/app-refresh';

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create'; day: string }
  | { mode: 'edit'; event: CalEvent };

type Snack = { message: string; undo?: CalEvent } | null;

function monthOfDay(day: string | null, fallback: Date): MonthAnchor {
  const date = (day ? parseDay(day) : null) ?? fallback;
  return { year: date.getFullYear(), month0: date.getMonth() };
}

function sameMonth(a: MonthAnchor, b: MonthAnchor): boolean {
  return a.year === b.year && a.month0 === b.month0;
}

export function MonthScreen() {
  const insets = useSafeAreaInsets();
  const today = toDateString(new Date());

  // Widget deep links: `?day=YYYY-MM-DD` lands the grid on that day's month;
  // `?new=` (a nonce so repeat taps re-fire) opens the new-event editor.
  const params = useLocalSearchParams<{ day?: string; new?: string }>();
  const dayParam =
    typeof params.day === 'string' && parseDay(params.day) ? params.day : null;
  const newParam = typeof params.new === 'string' ? params.new : null;

  const bottomInset = Platform.select({
    web: Spacing.four,
    default: insets.bottom + Spacing.three,
  });

  // Cold start lands on the deep-linked day's month via initialScrollIndex.
  const [initialMonth] = useState<MonthAnchor>(() =>
    monthOfDay(dayParam, new Date())
  );
  // Two months, deliberately. `month` tracks the scroll live and drives the
  // header label; `settledMonth` only moves once scrolling has stopped, and
  // drives the day dimming and the fetch — so the grid does not reshade under
  // a finger mid-drag, and a fling across several months costs one fetch.
  const [month, setMonth] = useState<MonthAnchor>(initialMonth);
  const [settledMonth, setSettledMonth] = useState<MonthAnchor>(initialMonth);
  const [editor, setEditor] = useState<EditorState>(
    newParam ? { mode: 'create', day: today } : { mode: 'closed' }
  );
  const [snack, setSnack] = useState<Snack>(null);
  const [popoverDay, setPopoverDay] = useState<string | null>(null);
  // Spins the header's refresh icon — only for button-pressed refreshes, not
  // the fetches that follow scrolling or the foreground poll.
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [gridSize, setGridSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  // The grid can take a few frames (occasionally longer) after mount to be
  // truly rendering at its landing position — until it reports anchored, a
  // cover with a spinner sits over the grid area so no half-anchored state
  // ever paints. Latched: resizes re-anchor instantly and stay uncovered.
  const [gridAnchored, setGridAnchored] = useState(false);
  const onGridAnchored = useCallback(() => setGridAnchored(true), []);
  // Safety valve for environments where viewability callbacks never fire
  // (e.g. a hidden tab suspending rAF): show the grid regardless after 4s.
  useEffect(() => {
    if (gridAnchored) return;
    const timer = setTimeout(() => setGridAnchored(true), 4000);
    return () => clearTimeout(timer);
  }, [gridAnchored]);

  const gridRef = useRef<MonthGridHandle>(null);

  // The widget's `+` deep-links `?new=<nonce>`; open the new-event editor (dated
  // today). Cold start seeds it above; a fresh nonce (warm start) re-opens here.
  const [handledNewParam, setHandledNewParam] = useState(newParam);
  if (newParam && newParam !== handledNewParam) {
    setHandledNewParam(newParam);
    setEditor({ mode: 'create', day: today });
  }

  // A deep link that changes `?day=` while mounted (warm start) is reconciled
  // here — the React-recommended "adjust state during render" alternative to a
  // setState effect. The scroll itself runs in the effect below once the grid
  // is mounted (it only needs layout, not events — the grid is pure date math);
  // a ref marks the consumed value so the effect fires once per deep link.
  const [handledDayParam, setHandledDayParam] = useState(dayParam);
  const [pendingScrollDay, setPendingScrollDay] = useState<string | null>(null);
  if (dayParam && dayParam !== handledDayParam) {
    setHandledDayParam(dayParam);
    setPendingScrollDay(dayParam);
  }
  const scrolledForDay = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingScrollDay || !gridSize) return;
    if (scrolledForDay.current === pendingScrollDay) return;
    scrolledForDay.current = pendingScrollDay;
    const target = monthOfDay(pendingScrollDay, new Date());
    gridRef.current?.scrollToMonth(target.year, target.month0, false);
  }, [pendingScrollDay, gridSize]);

  const monthDate = useMemo(
    () => new Date(month.year, month.month0, 1),
    [month]
  );
  const settledDate = useMemo(
    () => new Date(settledMonth.year, settledMonth.month0, 1),
    [settledMonth]
  );
  const { events, loading, error, refresh, fetchedAt } =
    useMonthEvents(settledDate);

  // Auto-dismiss the snackbar.
  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => setSnack(null), 6000);
    return () => clearTimeout(timer);
  }, [snack]);

  const onMonthChange = useCallback((anchor: MonthAnchor) => {
    setMonth((prev) => (sameMonth(prev, anchor) ? prev : anchor));
  }, []);

  const onMonthSettled = useCallback((anchor: MonthAnchor) => {
    setSettledMonth((prev) => (sameMonth(prev, anchor) ? prev : anchor));
  }, []);

  const onPressDay = useCallback(
    (day: string) => setEditor({ mode: 'create', day }),
    []
  );

  const onPressEvent = useCallback((event: CalEvent) => {
    setPopoverDay(null);
    setEditor({ mode: 'edit', event });
  }, []);

  const onLongPressDay = useCallback((day: string) => setPopoverDay(day), []);

  function goToday() {
    const target = monthOfDay(null, new Date());
    gridRef.current?.scrollToMonth(target.year, target.month0, true);
  }

  function onManualRefresh() {
    setManualRefreshing(true);
    refresh().finally(() => setManualRefreshing(false));
  }

  function onEditorDone(result: EditorResult) {
    setEditor({ mode: 'closed' });
    refresh();
    // The home-screen widget has no other way to learn about this mutation
    // (its background cycle is unreliable on aggressive ROMs); foreground
    // refresh here is the one dependable trigger. Same story for scheduled
    // alarm notifications.
    refreshAgendaWidget();
    runAlarmReconcile();
    if (result === 'created') setSnack({ message: 'Event added' });
    else if (result === 'updated') setSnack({ message: 'Saved' });
    else if (result === 'conflict') {
      setSnack({ message: 'Event changed elsewhere — list refreshed' });
    } else setSnack({ message: 'Event deleted', undo: result.deleted });
  }

  async function undoDelete(event: CalEvent) {
    setSnack(null);
    try {
      await restoreEvent(event);
      refresh();
      refreshAgendaWidget();
      runAlarmReconcile();
    } catch (err) {
      setSnack({
        message: err instanceof Error ? err.message : 'Could not restore event',
      });
    }
  }

  const popoverEvents = useMemo(() => {
    if (!popoverDay) return [];
    return events.filter((event) =>
      eventDays(event.start, event.end).includes(popoverDay)
    );
  }, [events, popoverDay]);

  const weekdayLabels = useMemo(
    () =>
      // 2024-01-01 is a Monday; weeks start Monday.
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(undefined, {
          weekday: 'short',
        })
      ),
    []
  );

  if (!davConfigured) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.setupWrapper}>
          <ThemedView type="backgroundElement" style={styles.setupCard}>
            <ThemedText type="subtitle">
              No calendar server configured
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              This build has no CalDAV server URL. Set{' '}
              <ThemedText type="code">EXPO_PUBLIC_DAV_URL</ThemedText> when
              building the app (see{' '}
              <ThemedText type="code">app/.env.example</ThemedText>) and rebuild
              — the URL is baked in at build time. Web builds default to{' '}
              <ThemedText type="code">/dav/</ThemedText> on their own origin.
            </ThemedText>
          </ThemedView>
        </View>
      </ThemedView>
    );
  }

  const monthLabel = monthDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          <MonthHeader
            label={monthLabel}
            monthIndex={month.year * 12 + month.month0}
            loading={loading && events.length === 0}
            refreshing={manualRefreshing}
            fetchedAt={fetchedAt}
            onToday={goToday}
            onRefresh={onManualRefresh}
            onAdd={() => setEditor({ mode: 'create', day: today })}
          />

          {error && (
            <ThemedView type="backgroundElement" style={styles.errorBanner}>
              <ThemedText type="small" style={styles.errorText}>
                {error}
              </ThemedText>
              <Pressable onPress={refresh}>
                <ThemedText type="smallBold" style={{ color: AccentColor }}>
                  Retry
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}

          <View style={styles.weekdays}>
            {weekdayLabels.map((label) => (
              // The column is the View, as in the grid's own rows. Putting flex
              // on the Text instead sizes each label to its own word plus an
              // equal share of the slack, which spaces the labels evenly from
              // each other rather than aligning them to the columns beneath.
              <View key={label} style={styles.weekdayCell}>
                <ThemedText type="small" style={styles.weekday}>
                  {label}
                </ThemedText>
              </View>
            ))}
          </View>

          <View
            style={styles.gridWrap}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setGridSize((prev) =>
                prev && prev.width === width && prev.height === height
                  ? prev
                  : { width, height }
              );
            }}
          >
            {gridSize && (
              <MonthGrid
                ref={gridRef}
                width={gridSize.width}
                height={gridSize.height}
                events={events}
                today={today}
                initialMonth={initialMonth}
                focusedMonth={settledMonth}
                onMonthChange={onMonthChange}
                onMonthSettled={onMonthSettled}
                onAnchored={onGridAnchored}
                onPressDay={onPressDay}
                onPressEvent={onPressEvent}
                onLongPressDay={onLongPressDay}
              />
            )}
            {(!gridAnchored || !gridSize) && (
              <ThemedView style={styles.gridCover}>
                <ActivityIndicator size="large" color={AccentColor} />
              </ThemedView>
            )}
          </View>
        </View>
      </SafeAreaView>

      {snack && (
        <View style={[styles.snackWrapper, { bottom: bottomInset }]}>
          <View style={styles.snack}>
            <ThemedText type="small" style={styles.snackText} numberOfLines={2}>
              {snack.message}
            </ThemedText>
            {snack.undo && (
              <Pressable onPress={() => undoDelete(snack.undo!)}>
                <ThemedText type="smallBold" style={{ color: AccentColor }}>
                  Undo
                </ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {popoverDay && (
        <DayPopover
          day={popoverDay}
          events={popoverEvents}
          onClose={() => setPopoverDay(null)}
          onPressEvent={onPressEvent}
        />
      )}

      {editor.mode !== 'closed' && (
        <EventEditor
          key={editor.mode === 'edit' ? editor.event.id : `new-${editor.day}`}
          event={editor.mode === 'edit' ? editor.event : null}
          defaultDay={editor.mode === 'create' ? editor.day : today}
          onClose={() => setEditor({ mode: 'closed' })}
          onDone={onEditorDone}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  // Full-bleed on every platform: a month grid is a seven-column table, so the
  // window's width is the columns' width. Capping it (the 800px
  // MaxContentWidth inherited from the notes app) left a desktop browser
  // showing a narrow strip of calendar in a field of empty ground.
  content: {
    flex: 1,
    width: '100%',
  },
  setupWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  setupCard: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.one,
    maxWidth: 480,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.one,
    marginBottom: Spacing.two,
  },
  errorText: {
    flex: 1,
  },
  // Continues the accent bar above it, so the header reads as one block down
  // to the grid. No separator of its own: the grid's first row already draws a
  // rule directly beneath, and a second line would double it.
  weekdays: {
    flexDirection: 'row',
    backgroundColor: HEADER_GROUND,
    paddingBottom: Spacing.two,
  },
  weekdayCell: {
    flex: 1,
    // Matches the day number's own inset (2 margin + 4 padding) so each label
    // sits directly above its column's number.
    paddingLeft: 6,
  },
  weekday: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AccentColor,
  },
  gridWrap: {
    flex: 1,
  },
  gridCover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snackWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    pointerEvents: 'box-none',
  },
  snack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    // Inverse surface: the snack keeps the dark palette in both schemes.
    backgroundColor: Colors.dark.backgroundSelected,
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    maxWidth: 480,
  },
  snackText: {
    color: Colors.dark.text,
    flexShrink: 1,
  },
});
