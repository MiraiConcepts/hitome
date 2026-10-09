// THROWAWAY gallery (see app/src/gallery/REVERT.md). The month view's
// pieces: header, weekday row, event strips, tags, one week, and a real
// month grid over sample events.
import { useMemo, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { EventBanner, EventChip } from '@/components/calendar/event-chip';
import { EventTags } from '@/components/calendar/event-tags';
import { GridSpotlight } from '@/components/calendar/grid-spotlight';
import { MonthGrid } from '@/components/calendar/month-grid';
import { HEADER_GROUND, MonthHeader } from '@/components/calendar/month-header';
import {
  COUNTER_FOOTPRINT,
  DAY_NUMBER_HEIGHT,
  EVENT_GAP,
  SLOT_HEIGHT,
  WeekRow,
} from '@/components/calendar/week-row';
import { SettingsButton } from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, Colors, Spacing } from '@/constants/theme';
import {
  getFirstDayOfWeek,
  weekStartOf,
  type MonthAnchor,
} from '@/utils/calendar-grid';
import { eventDays, toDateString } from '@/utils/date';

import { useOverlays } from '../overlays';
import { Note, Row, Section, Specimen, Tag } from '../parts';
import { GRID_EVENTS, SAMPLE, TODAY } from '../sample-data';

const noop = () => {};

/** The month screen's weekday row. A copy: in the app it is inline JSX in
 *  month-screen.tsx, not a component, so there is nothing to import. */
function WeekdayRow() {
  const labels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 7 + getFirstDayOfWeek() + i).toLocaleDateString(
          undefined,
          { weekday: 'short' }
        )
      ),
    []
  );
  return (
    <View style={styles.weekdays}>
      {labels.map((label) => (
        <View key={label} style={styles.weekdayCell}>
          <ThemedText type="small" style={styles.weekday}>
            {label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

function monthLabel(anchor: MonthAnchor) {
  return new Date(anchor.year, anchor.month0, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

function Header(
  props: Partial<{
    anchor: MonthAnchor;
    loading: boolean;
    refreshing: boolean;
    offline: boolean;
    authFailed: boolean;
    fetchedAt: Date | null;
  }>
) {
  const { openEditor } = useOverlays();
  const now = new Date();
  const anchor = props.anchor ?? {
    year: now.getFullYear(),
    month0: now.getMonth(),
  };
  return (
    <MonthHeader
      label={monthLabel(anchor)}
      monthIndex={anchor.year * 12 + anchor.month0}
      loading={props.loading ?? false}
      refreshing={props.refreshing ?? false}
      today={TODAY}
      offline={props.offline ?? false}
      authFailed={props.authFailed ?? false}
      fetchedAt={props.fetchedAt === undefined ? now : props.fetchedAt}
      onToday={noop}
      onRefresh={noop}
      onAdd={() => openEditor({ event: null, defaultDay: TODAY })}
      onSettings={noop}
    />
  );
}

/** A grid cell's worth of room for one strip. */
function Strip({
  width,
  lines,
  children,
}: {
  width: number;
  lines: number;
  children: (style: object) => ReactNode;
}) {
  return (
    <View style={[styles.cell, { width, height: lines * SLOT_HEIGHT + 8 }]}>
      {children({
        position: 'absolute',
        left: 0,
        right: 0,
        top: 4,
        height: lines * SLOT_HEIGHT - EVENT_GAP,
      })}
    </View>
  );
}

export function CalendarSection() {
  const { openEditor, openDay } = useOverlays();
  const { width } = useWindowDimensions();
  const [twelveMinutesAgo] = useState(() => new Date(Date.now() - 12 * 60_000));
  // The grid's own cell, from this window's width (the gallery pads 16 each
  // side, so the strips get a cell as the full-bleed grid would).
  const cell = Math.max(40, Math.floor(width / 7));
  const press = (event: CalEvent) => ({
    onPress: () => openEditor({ event, defaultDay: toDateString(event.start) }),
    onLongPress: noop,
    onPressIn: noop,
    onPressOut: noop,
    delayLongPress: 350,
    unstable_pressDelay: 90,
  });
  const chips: [string, CalEvent, number][] = [
    ['timed, 1 line', SAMPLE.dentist, 1],
    ['emoji', SAMPLE.lunch, 1],
    ['long title, 1 line (cut)', SAMPLE.planning, 1],
    ['long title, 2 lines', SAMPLE.planning, 2],
    ['calendar colour (Work)', SAMPLE.standup, 1],
    ['untitled', SAMPLE.untitled, 1],
  ];
  const banners: [string, CalEvent, number, number, boolean][] = [
    ['all-day, 1 day', SAMPLE.allDayToday, 1, 1, false],
    ['birthday colour', SAMPLE.birthday, 1, 1, false],
    ['multi-day, 3 days', SAMPLE.trip, 3, 1, false],
    ['continues past the week edge', SAMPLE.trip, 2, 1, true],
    ['timed multi-day (a banner too)', SAMPLE.hackathon, 3, 1, false],
    ['long title, 2 lines', SAMPLE.planning, 2, 2, false],
    ['accent (no calendar colour)', SAMPLE.dentist, 2, 1, false],
  ];

  // One week (today's), as the grid lays it out at a six-row height.
  const weekStart = toDateString(weekStartOf(new Date()));
  const rowHeight = Math.max(96, Math.floor(((width * 0.75) / 6) * 1.2));
  const eventsHeight = rowHeight - DAY_NUMBER_HEIGHT;
  const slotCount = Math.max(0, Math.floor(eventsHeight / SLOT_HEIGHT));
  const counterNeedsSlot =
    eventsHeight - slotCount * SLOT_HEIGHT + EVENT_GAP < COUNTER_FOOTPRINT;
  const now = new Date();

  return (
    <Section
      id="calendar"
      title="Calendar"
      intro="The month view's pieces on sample events (made up, nothing fetched). Tapping an event opens the sample editor; a busy day opens the day list."
    >
      <Specimen
        name="MonthHeader"
        file="components/calendar/month-header.tsx"
        shows="normal (today's date line); loading bar (first fetch); refreshing; offline with age; offline, never loaded; login rejected. The + opens the sample editor."
        bare
      >
        <Tag>normal</Tag>
        <Header />
        <Tag>loading (first fetch: the bar sweeps)</Tag>
        <Header loading />
        <Tag>refreshing (button-pressed refresh)</Tag>
        <Header refreshing />
        <Tag>offline, updated 12 min ago</Tag>
        <Header offline fetchedAt={twelveMinutesAgo} />
        <Tag>offline, nothing ever loaded</Tag>
        <Header offline fetchedAt={null} />
        <Tag>login rejected</Tag>
        <Header offline authFailed />
      </Specimen>

      <Specimen
        name="Weekday row"
        file="components/calendar/month-screen.tsx (inline JSX, copied here)"
        shows="The row under the header, starting on this browser's first weekday"
        bare
      >
        <WeekdayRow />
      </Specimen>

      <Specimen
        name="EventChip (timed, single-day)"
        file="components/calendar/event-chip.tsx"
        shows={`In a ${cell} px cell (this window's grid cell). The grid grants at most 2 lines. The grid draws no repeat or alert markers (only the widget had them, and it no longer does).`}
      >
        <Row gap={Spacing.two}>
          {chips.map(([label, event, lines]) => (
            <View key={label} style={styles.stripCell}>
              <Tag>{label}</Tag>
              <Strip width={cell} lines={lines}>
                {(style) => (
                  <EventChip
                    event={event}
                    titleLines={lines}
                    style={style}
                    {...press(event)}
                  />
                )}
              </Strip>
            </View>
          ))}
        </Row>
      </Specimen>

      <Specimen
        name="EventBanner (all-day and multi-day)"
        file="components/calendar/event-chip.tsx"
        shows="Filled in the calendar's colour, ink picked for contrast; flush right when it continues into the next week"
      >
        <Row gap={Spacing.two}>
          {banners.map(([label, event, span, lines, continues]) => (
            <View key={label} style={styles.stripCell}>
              <Tag>{label}</Tag>
              <Strip width={cell * span} lines={lines}>
                {(style) => (
                  <EventBanner
                    placement={{
                      event,
                      startCol: 0,
                      span,
                      slot: 0,
                      rows: lines,
                      continuesLeft: false,
                      continuesRight: continues,
                    }}
                    titleLines={lines}
                    style={style}
                    {...press(event)}
                  />
                )}
              </Strip>
            </View>
          ))}
        </Row>
        <Note>
          Hover (web) dims every other event; pressing a banner washes it toward
          the ground. Both need a pointer, so they show only live.
        </Note>
      </Specimen>

      <Specimen
        name="EventTags"
        file="components/calendar/event-tags.tsx"
        shows="place (blue, opens maps); Join Meeting (accent); plain link (shown as its host); all three; a long place that wraps"
      >
        {(
          [
            ['place', SAMPLE.dentist],
            ['Join Meeting', SAMPLE.standup],
            ['plain link', SAMPLE.hackathon],
            ['all three', SAMPLE.planning],
            [
              'long place',
              {
                ...SAMPLE.trip,
                location:
                  'Tokyo Big Sight, East Exhibition Hall 7, 3 Chome-11-1 Ariake, Koto City, Tokyo 135-0063, Japan',
              },
            ],
          ] as const
        ).map(([label, event]) => (
          <View key={label} style={styles.tagRow}>
            <Tag>{label}</Tag>
            <View style={styles.tagBox}>
              <EventTags event={event} />
            </View>
          </View>
        ))}
      </Specimen>

      <Specimen
        name="WeekRow"
        file="components/calendar/week-row.tsx"
        shows={`This week, at a ${rowHeight} px row (${slotCount} slots). Today in blue; tap a busy day for its list, an empty one for a new event.`}
        bare
      >
        <View style={[styles.weekBox, { height: rowHeight }]}>
          <WeekRow
            weekStart={weekStart}
            rowHeight={rowHeight}
            cellWidth={(width - 2 * Spacing.three - 2) / 7}
            slotCount={slotCount}
            counterNeedsSlot={counterNeedsSlot}
            events={GRID_EVENTS}
            todayStr={TODAY}
            focusedYear={now.getFullYear()}
            focusedMonth0={now.getMonth()}
            pulse={null}
            onOpenDay={(day) => openDay(day, eventsOn(day))}
            onPressEvent={(event) =>
              openEditor({ event, defaultDay: toDateString(event.start) })
            }
            onCreateOnDay={(day) =>
              openEditor({ event: null, defaultDay: day })
            }
          />
        </View>
      </Specimen>

      <SampleMonth />
    </Section>
  );
}

function eventsOn(day: string) {
  return GRID_EVENTS.filter((e) => eventDays(e.start, e.end).includes(day));
}

/** The real MonthGrid in a box, over the sample events, with the header and
 *  weekday row above it: the month screen without its data. */
function SampleMonth() {
  const [open, setOpen] = useState(false);
  const file =
    'components/calendar/month-grid.tsx, with MonthHeader and the weekday row';
  if (Platform.OS === 'web')
    return (
      <Specimen
        name="MonthGrid (real, sample events)"
        file={file}
        shows="Scrolls by month like the app (±5 years). Tap events, busy days (+N), empty days; hold a day for a new event. The web hover crosshair (GridSpotlight) is on."
        bare
      >
        <SampleMonthGrid />
      </Specimen>
    );
  // A phone cannot nest the grid's list in this page's scroll view, so the
  // grid opens full screen over it.
  return (
    <Specimen
      name="MonthGrid (real, sample events)"
      file={file}
      shows="Opens full screen (a list cannot sit inside this page's scroll view on a phone). Tapping an event or a day closes it and opens the editor or the day list."
    >
      <SettingsButton
        label="Open the sample month"
        variant="filled"
        onPress={() => setOpen(true)}
      />
      {open && (
        <Modal visible onRequestClose={() => setOpen(false)}>
          <ThemedView style={styles.fill}>
            <SampleMonthGrid fill onLeave={() => setOpen(false)} />
            <View style={styles.close}>
              <SettingsButton label="Close" onPress={() => setOpen(false)} />
            </View>
          </ThemedView>
        </Modal>
      )}
    </Specimen>
  );
}

function SampleMonthGrid({
  fill = false,
  onLeave = noop,
}: {
  fill?: boolean;
  onLeave?: () => void;
}) {
  const overlays = useOverlays();
  const openEditor: typeof overlays.openEditor = (request) => {
    onLeave();
    overlays.openEditor(request);
  };
  const openDay: typeof overlays.openDay = (day, events) => {
    onLeave();
    overlays.openDay(day, events);
  };
  const { height: windowHeight } = useWindowDimensions();
  const now = new Date();
  const [initial] = useState<MonthAnchor>({
    year: now.getFullYear(),
    month0: now.getMonth(),
  });
  const [month, setMonth] = useState(initial);
  const [settled, setSettled] = useState(initial);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const height = Math.max(420, Math.min(720, windowHeight - 220));
  return (
    <>
      <Header anchor={month} />
      <WeekdayRow />
      <View
        style={fill ? styles.fill : { height }}
        onLayout={(e) => {
          const { width, height: h } = e.nativeEvent.layout;
          setSize((prev) =>
            prev && prev.width === width && prev.height === h
              ? prev
              : { width, height: h }
          );
        }}
      >
        {size && (
          <MonthGrid
            width={size.width}
            height={size.height}
            events={GRID_EVENTS}
            today={TODAY}
            initialMonth={initial}
            focusedMonth={settled}
            onMonthChange={setMonth}
            onMonthSettled={setSettled}
            onAnchored={noop}
            pulse={null}
            onOpenDay={(day) => openDay(day, eventsOn(day))}
            onPressEvent={(event) =>
              openEditor({ event, defaultDay: toDateString(event.start) })
            }
            onCreateOnDay={(day) =>
              openEditor({ event: null, defaultDay: day })
            }
          />
        )}
        <GridSpotlight />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  close: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.five,
  },
  weekdays: {
    flexDirection: 'row',
    backgroundColor: HEADER_GROUND,
    paddingBottom: Spacing.two,
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
  cell: {
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: '#60646C',
  },
  stripCell: {
    gap: Spacing.one,
  },
  tagRow: {
    gap: Spacing.one,
  },
  tagBox: {
    maxWidth: 320,
  },
  weekBox: {
    width: '100%',
  },
});
