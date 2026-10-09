import { router, usePathname } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { runAlarmReconcile } from '@/alarms/runner';
import {
  undoDelete as undoDeleteOnServer,
  type EditScope,
  requestSync,
} from '@/data/events';
import type { CalEvent } from '@/caldav/types';
import { LARGE_SPINNER } from '@/components/boot-screen';
import { markCalendarReady } from '@/components/calendar/calendar-ready';
import { ConnectionProblem } from '@/components/calendar/connection-problem';
import { DayPopover } from '@/components/calendar/day-popover';
import { GridSpotlight } from '@/components/calendar/grid-spotlight';
import {
  EventEditor,
  type EditorResult,
} from '@/components/calendar/event-editor';
import {
  MonthGrid,
  type MonthGridHandle,
} from '@/components/calendar/month-grid';
import { HEADER_GROUND, MonthHeader } from '@/components/calendar/month-header';
import {
  AlertCircleIcon,
  CalendarPlusIcon,
  CheckIcon,
  type IconProps,
  RefreshIcon,
  TrashIcon,
  WifiOffIcon,
} from '@/components/icons';
import { Spinner } from '@/components/spinner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, Colors, OnAccentColor, Spacing } from '@/constants/theme';
import {
  classifyConnectError,
  webConnectionProblem,
} from '@/config/dav-config';
import { recheckSource } from '@/config/source';
import { useCalendarKeys } from '@/hooks/use-calendar-keys';
import { useDeepLink } from '@/hooks/use-deep-link';
import { useMonthEvents } from '@/hooks/use-month-events';
import {
  inHiddenCalendar,
  useHiddenCalendars,
} from '@/config/calendar-visibility';
import { getFirstDayOfWeek, type MonthAnchor } from '@/utils/calendar-grid';
import { eventDays, parseDay, toDateString } from '@/utils/date';
import { refreshAgendaWidget } from '@/widget/app-refresh';

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create'; day: string }
  | { mode: 'edit'; event: CalEvent };

/** The toast's lead: what happened, black on an accent block. */
function SnackMark({ icon: Icon }: { icon: ComponentType<IconProps> }) {
  return (
    <View style={styles.snackMark}>
      <Icon size={18} color={OnAccentColor} />
    </View>
  );
}

/** The toast's fade in and out: long enough to read as easing, short
 *  enough that a tap on Undo never waits on it. */
const SNACK_FADE_MS = 150;

type Snack = {
  message: string;
  /** What happened, as a glyph on the toast's accent block. */
  icon: ComponentType<IconProps>;
  undo?: { event: CalEvent; scope: EditScope };
} | null;

/** A widget row tapped and not yet resolved: the id to look for, the day to
 *  fall back to, and the freshness stamp that was current when the tap landed.
 *  A miss only means "gone" once that stamp has moved — i.e. the server has
 *  answered since. Comparing stamps rather than clocks keeps this pure and is
 *  the more precise question anyway. */
type PendingEvent = { id: string; day: string; since: Date | null } | null;

/** Deep links already acted on, kept across rebuilds of the screen. */
const actedOn = new Set<string>();

/** How long to wait for a fetch before treating a widget-tapped event as gone.
 *  Off the tailnet nothing will ever land, and hanging on an unresolved tap is
 *  worse than showing the day. */
const RESOLVE_TIMEOUT_MS = 6_000;

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
  // `?event=<id>` additionally opens that event once a fetch has landed;
  // `?new=` (a nonce so repeat taps re-fire) opens the new-event editor.
  const link = useDeepLink();
  const dayParam = link.day && parseDay(link.day) ? link.day : null;
  // A link opens its event (or the new-event editor) once. The screen is
  // rebuilt without the app relaunching (a new week start keys it), and a
  // rebuild that re-read the last link reopened a widget-tapped event behind
  // Settings, where the next Back closed it instead of leaving Settings.
  const eventParam =
    link.event && !actedOn.has(`event:${link.event}`) ? link.event : null;
  const newParam =
    link.new && !actedOn.has(`new:${link.new}`) ? link.new : null;
  useEffect(() => {
    if (link.event) actedOn.add(`event:${link.event}`);
    if (link.new) actedOn.add(`new:${link.new}`);
  }, [link.event, link.new]);

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
  const onGridAnchored = useCallback(() => {
    setGridAnchored(true);
    markCalendarReady();
  }, []);
  // A spinner over the cover only once anchoring has taken a noticeable
  // while: a quick anchor (the usual case) shows a still background that
  // fades away, not a spinner flashing for a frame or two.
  const [coverSpinner, setCoverSpinner] = useState(false);
  useEffect(() => {
    if (gridAnchored) return;
    const timer = setTimeout(
      () => setCoverSpinner(true),
      COVER_SPINNER_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [gridAnchored]);
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

  // A tapped widget row carries the event's id alongside its day. The widget's
  // snapshot can be half an hour old, so the id is not trusted on sight: it is
  // matched against the month's events, and only declared gone once the server
  // has answered since the tap (or has clearly stopped answering). Gone means
  // the day's list — "here is what is actually on that day" is the honest reply
  // to a tap on something that no longer exists.
  const [pendingEvent, setPendingEvent] = useState<PendingEvent>(() =>
    eventParam && dayParam
      ? { id: eventParam, day: dayParam, since: null }
      : null
  );
  /** The day a widget tap landed on, waiting for the grid to be visible before
   *  it is flashed. */
  const [arrivedDay, setArrivedDay] = useState<string | null>(null);
  /** What the grid should flash, and a nonce so the same day can flash twice. */
  const [pulse, setPulse] = useState<{ day: string; nonce: number } | null>(
    null
  );

  const monthDate = useMemo(
    () => new Date(month.year, month.month0, 1),
    [month]
  );
  const settledDate = useMemo(
    () => new Date(settledMonth.year, settledMonth.month0, 1),
    [settledMonth]
  );
  const {
    events: allEvents,
    loading,
    error,
    authFailed,
    refresh,
    fetchedAt,
  } = useMonthEvents(settledDate);
  // Calendars hidden in settings stay fetched and cached — only drawn less.
  const hiddenCalendars = useHiddenCalendars();
  const events = useMemo(
    () =>
      hiddenCalendars.length === 0
        ? allEvents
        : allEvents.filter((e) => !inHiddenCalendar(e.url, hiddenCalendars)),
    [allEvents, hiddenCalendars]
  );

  // A widget row's id, resolved against the month's events — reconciled during
  // render like the other deep links above, not in an effect.
  const [handledEventParam, setHandledEventParam] = useState(eventParam);
  if (eventParam && eventParam !== handledEventParam) {
    setHandledEventParam(eventParam);
    if (dayParam) {
      setPendingEvent({ id: eventParam, day: dayParam, since: fetchedAt });
    }
  }
  if (pendingEvent) {
    const match = events.find((event) => event.id === pendingEvent.id);
    if (match) {
      // No flash here: the editor names the day in its own title, and you are
      // looking at the very thing you tapped. Flashing on dismissal answers a
      // question nobody asked.
      setPendingEvent(null);
      setEditor({ mode: 'edit', event: match });
    } else if (fetchedAt !== pendingEvent.since) {
      // Missing is not yet gone — the month may simply not have loaded. Only a
      // fetch that landed since the tap settles it, and this one has.
      setPendingEvent(null);
      setArrivedDay(pendingEvent.day);
      setPopoverDay(pendingEvent.day);
    }
  }

  // Nothing may ever land — off the tailnet the fetch never answers, and
  // sitting on an unresolved tap is worse than showing the day.
  useEffect(() => {
    if (!pendingEvent) return;
    const timer = setTimeout(() => {
      setPendingEvent(null);
      setArrivedDay(pendingEvent.day);
      setPopoverDay(pendingEvent.day);
    }, RESOLVE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingEvent]);

  // Flash the day only when the tapped event turned out to be gone — the one
  // case where what opened is not what was asked for, so the day is worth
  // pointing at. Held until the grid is actually visible: firing it under the
  // popover would spend the whole animation behind it. Reads the pre-update
  // popover, so the render that opens one does not also flash beneath it.
  const overlayOpen = editor.mode !== 'closed' || popoverDay !== null;
  if (arrivedDay && !overlayOpen) {
    setPulse((prev) => ({ day: arrivedDay, nonce: (prev?.nonce ?? 0) + 1 }));
    setArrivedDay(null);
  }

  // Auto-dismiss the snackbar — after 8s, so Undo is still there once the
  // grid has visibly changed and the mistake sinks in.
  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => setSnack(null), 8000);
    return () => clearTimeout(timer);
  }, [snack]);

  const onMonthChange = useCallback((anchor: MonthAnchor) => {
    setMonth((prev) => (sameMonth(prev, anchor) ? prev : anchor));
  }, []);

  const onMonthSettled = useCallback((anchor: MonthAnchor) => {
    setSettledMonth((prev) => (sameMonth(prev, anchor) ? prev : anchor));
  }, []);

  // Tap a cell (or an event in a cell holding more than it can show) — the
  // day's full list.
  const onOpenDay = useCallback((day: string) => setPopoverDay(day), []);

  const onPressEvent = useCallback((event: CalEvent) => {
    setPopoverDay(null);
    setEditor({ mode: 'edit', event });
  }, []);

  // Hold a cell anywhere, its events included — a new event on that day.
  const onCreateOnDay = useCallback(
    (day: string) => setEditor({ mode: 'create', day }),
    []
  );

  // The header's + on the web starts on the month being looked at: today when
  // it is in view, else that month's 1st. (The phone keeps today: its + is
  // usually reached from the widget, about now.)
  const addDay =
    Platform.OS === 'web' && !sameMonth(month, monthOfDay(null, new Date()))
      ? toDateString(new Date(month.year, month.month0, 1))
      : today;

  function goToday() {
    const target = monthOfDay(null, new Date());
    gridRef.current?.scrollToMonth(target.year, target.month0, true);
  }

  // Settings is presented over this screen rather than replacing it, so the
  // route says whether the grid is what the keyboard is pointed at.
  const pathname = usePathname();
  useCalendarKeys({
    enabled: pathname === '/' && !overlayOpen,
    onNew: () => setEditor({ mode: 'create', day: addDay }),
    onToday: goToday,
    onStepMonth: (step) => {
      const target = new Date(month.year, month.month0 + step, 1);
      gridRef.current?.scrollToMonth(
        target.getFullYear(),
        target.getMonth(),
        true
      );
    },
    onShowDay: (day) => {
      const target = monthOfDay(day, new Date());
      gridRef.current?.scrollToMonth(target.year, target.month0, true);
    },
  });

  function onManualRefresh() {
    setManualRefreshing(true);
    // Android: ask DAVx⁵ to sync now (what lands then redraws the grid by
    // itself); web: nothing to ask. Either way, read what is there now.
    requestSync().catch(() => {});
    // Held for a beat at least: reading the phone's own store takes a few
    // milliseconds, and a bar that only flashes reads as nothing happening.
    Promise.all([
      refresh(),
      new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_BAR_MS)),
    ]).finally(() => setManualRefreshing(false));
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
    if (result === 'created')
      setSnack({ message: 'Event added', icon: CalendarPlusIcon });
    else if (result === 'updated')
      setSnack({ message: 'Saved', icon: CheckIcon });
    else if (result === 'conflict') {
      setSnack({
        message: 'Event changed elsewhere. List refreshed',
        icon: RefreshIcon,
      });
    } else
      setSnack({
        icon: TrashIcon,
        message:
          result.scope === 'this'
            ? 'Occurrence deleted'
            : result.scope === 'following'
              ? 'Following occurrences deleted'
              : 'Event deleted',
        undo: { event: result.deleted, scope: result.scope },
      });
  }

  async function undoDelete({
    event,
    scope,
  }: {
    event: CalEvent;
    scope: EditScope;
  }) {
    setSnack(null);
    try {
      await undoDeleteOnServer(event, scope);
      refresh();
      refreshAgendaWidget();
      runAlarmReconcile();
    } catch (err) {
      setSnack({
        message: err instanceof Error ? err.message : 'Could not restore event',
        icon: AlertCircleIcon,
      });
    }
  }

  // Web says what went wrong in its own terms (there is no login to fix in
  // the app, only on the server). A calendar that has never loaded gets the
  // whole screen; one that has keeps its grid and a bar saying it is stale.
  const problem = useMemo(
    () =>
      Platform.OS === 'web' && error
        ? webConnectionProblem(
            authFailed
              ? 'unauthorized'
              : classifyConnectError(new Error(error)),
            error
          )
        : null,
    [error, authFailed]
  );
  const neverLoaded = problem !== null && !fetchedAt && allEvents.length === 0;
  // A refused request on the web usually means the session is over (the
  // password changed, or Log out everywhere ran on another device): ask the
  // server, which sends the app back to its login screen if so.
  useEffect(() => {
    if (Platform.OS === 'web' && authFailed) recheckSource();
  }, [authFailed]);

  const popoverEvents = useMemo(() => {
    if (!popoverDay) return [];
    return events.filter((event) =>
      eventDays(event.start, event.end).includes(popoverDay)
    );
  }, [events, popoverDay]);

  const weekdayLabels = useMemo(
    () =>
      // 2024-01-07 is a Sunday; the row starts on the phone's first weekday.
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 7 + getFirstDayOfWeek() + i).toLocaleDateString(
          undefined,
          { weekday: 'short' }
        )
      ),
    []
  );

  // Short month names ('Sept 2026'), the same abbreviation the grid uses for
  // a month's first day. Spelled out, the longest months wrapped onto a second
  // line beside the header's buttons on a phone.
  const monthLabel = monthDate.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });

  return (
    <ThemedView style={styles.container}>
      {/* No bottom edge: the grid runs to the screen's bottom and the last row
          sits under the gesture bar, which is the trade taken deliberately —
          insetting it cost every row height and shortened every scroll. The
          snackbar and the version badge sit outside this and apply the inset
          themselves, so they stay clear of the bar regardless. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          <MonthHeader
            label={monthLabel}
            monthIndex={month.year * 12 + month.month0}
            loading={loading && events.length === 0}
            refreshing={manualRefreshing}
            today={today}
            offline={Boolean(error)}
            authFailed={authFailed}
            fetchedAt={fetchedAt}
            onToday={goToday}
            onRefresh={onManualRefresh}
            onAdd={() => setEditor({ mode: 'create', day: addDay })}
            onSettings={() => router.navigate('/settings')}
          />

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
                pulse={pulse}
                onOpenDay={onOpenDay}
                onPressEvent={onPressEvent}
                onCreateOnDay={onCreateOnDay}
              />
            )}
            <GridSpotlight />
            {(!gridAnchored || !gridSize) && (
              // The spinner only shows if anchoring is actually slow.
              <ThemedView style={styles.gridCover}>
                {coverSpinner && (
                  <Spinner color={AccentColor} size={LARGE_SPINNER} />
                )}
              </ThemedView>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Floating, not in the grid's flow: a bar that arrived in flow
          resized the grid pane after it had anchored, and the grid re-landed
          years off (Jul 2022 for an October start). */}
      {/* Always mounted (it lays out nothing when empty), so a bar leaving
          can fade out rather than vanish with its parent. */}
      <View style={[styles.snackWrapper, { bottom: bottomInset }]}>
        {error && !neverLoaded && (
          <Animated.View
            entering={FadeIn.duration(SNACK_FADE_MS)}
            exiting={FadeOut.duration(SNACK_FADE_MS)}
            style={styles.snack}
            testID="error-banner"
          >
            <SnackMark icon={authFailed ? AlertCircleIcon : WifiOffIcon} />
            <ThemedText type="small" style={styles.snackText} numberOfLines={2}>
              {problem?.title ?? error}
            </ThemedText>
            {/* A rejected login is not something retrying fixes. */}
            <Pressable
              accessibilityRole="button"
              style={styles.snackButton}
              onPress={
                authFailed && !problem
                  ? () => router.navigate('/settings')
                  : onManualRefresh
              }
            >
              <ThemedText type="smallBold" style={styles.snackAction}>
                {authFailed && !problem ? 'Settings' : 'Retry'}
              </ThemedText>
            </Pressable>
          </Animated.View>
        )}
        {snack && (
          <Animated.View
            entering={FadeIn.duration(SNACK_FADE_MS)}
            exiting={FadeOut.duration(SNACK_FADE_MS)}
            style={[styles.snack, !snack.undo && styles.snackPlain]}
          >
            <SnackMark icon={snack.icon} />
            <ThemedText type="small" style={styles.snackText} numberOfLines={2}>
              {snack.message}
            </ThemedText>
            {snack.undo && (
              <Pressable
                accessibilityRole="button"
                style={styles.snackButton}
                onPress={() => undoDelete(snack.undo!)}
              >
                <ThemedText type="smallBold" style={styles.snackAction}>
                  Undo
                </ThemedText>
              </Pressable>
            )}
          </Animated.View>
        )}
      </View>

      {neverLoaded && problem && (
        <ConnectionProblem
          problem={problem}
          busy={manualRefreshing}
          onRetry={onManualRefresh}
        />
      )}

      {popoverDay && (
        <DayPopover
          day={popoverDay}
          events={popoverEvents}
          onClose={() => setPopoverDay(null)}
          onPressEvent={onPressEvent}
          onAdd={
            Platform.OS === 'web'
              ? () => {
                  setPopoverDay(null);
                  setEditor({ mode: 'create', day: popoverDay });
                }
              : undefined
          }
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

const COVER_SPINNER_DELAY_MS = 600;
const MIN_REFRESH_BAR_MS = 900;

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
    // Bottom right, clear of the thumb's reach for the grid's middle.
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    pointerEvents: 'box-none',
  },
  snack: {
    flexDirection: 'row',
    // Stretched, so the mark's block runs the bar's full height; the text
    // and the button centre themselves.
    alignItems: 'stretch',
    gap: Spacing.three,
    // Inverse surface: the snack keeps the dark palette in both schemes.
    // Black with a ruled edge, so it stands off the grid's near-black cells.
    backgroundColor: Colors.dark.backgroundElement,
    borderWidth: 1,
    borderColor: Colors.dark.ruleStrong,
    paddingRight: Spacing.two,
    // A bar with a button and one without stand the same height: the
    // button's line plus its padding, the bar's padding, and the rule.
    minHeight: 20 + Spacing.one * 2 + Spacing.two * 2 + 2,
    maxWidth: 480,
  },
  // No button: the right gets the left's padding, or the message sits off
  // centre in its bar.
  snackPlain: {
    paddingRight: Spacing.three,
  },
  snackMark: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AccentColor,
  },
  snackText: {
    color: Colors.dark.text,
    flexShrink: 1,
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
  snackButton: {
    alignSelf: 'center',
  },
  snackAction: {
    color: OnAccentColor,
    backgroundColor: AccentColor,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
