import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CalEvent } from '@/caldav/types';
import { BlurBackdrop } from '@/components/blur-backdrop';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import { Overlay } from '@/components/calendar/day-popover';
import { HEADER_GROUND } from '@/components/calendar/month-header';
import { TextField } from '@/components/fields/text-field';
import {
  ChevronLeftIcon,
  EyeOffIcon,
  SearchIcon,
  XIcon,
} from '@/components/icons';
import { LoadingBar } from '@/components/loading-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BACKDROP_BLUR } from '@/constants/backdrop';
import { AccentColor, Colors, OnAccentColor, Spacing } from '@/constants/theme';
import type { CalendarRole } from '@/config/calendar-visibility';
import { useEscapeKey } from '@/hooks/use-escape-key';
import { useEventSearch } from '@/hooks/use-event-search';
import { useIsWide } from '@/hooks/use-is-wide';
import { useTheme } from '@/hooks/use-theme';
import { calendarTint } from '@/utils/calendar-tint';
import { formatTime } from '@/utils/date';
import {
  markRanges,
  queryWords,
  upcomingIndex,
  type AgendaRow,
  type SearchIndex,
} from '@/utils/search';

/** Every row one height, so the list can place any of them without
 *  measuring: opening at today and keeping its place when earlier events
 *  arrive above both need that. */
const EVENT_HEIGHT = 64;
const MONTH_HEIGHT = 40;
const EDGE_HEIGHT = 48;
const WHEN_COLUMN = 108;
const WHEN_COLUMN_COMPACT = 94;
/** How near the top a scroll gets before the year before is read. */
const EARLIER_AT = EVENT_HEIGHT * 3;

type Row = AgendaRow | { kind: 'edge'; key: string; label: string };

const heightOf = (row: Row) =>
  row.kind === 'event'
    ? EVENT_HEIGHT
    : row.kind === 'month'
      ? MONTH_HEIGHT
      : EDGE_HEIGHT;

type Props = {
  /** What the grid has loaded: searched instead when the events cannot be
   *  read (offline on the web). */
  loaded: CalEvent[];
  /** Changes after a save made from a result: the list is read again. */
  reload: number;
  roleOf: (event: CalEvent) => CalendarRole;
  calendarName: (event: CalEvent) => string | undefined;
  onPick: (event: CalEvent) => void;
  onClose: () => void;
  /** Something sits over the search (the editor): Escape and the keys are
   *  its, not the list's. */
  covered: boolean;
  /** The screen's message bar, shown over the search as the day list does. */
  toast?: ReactNode;
  /** Reads the events; the backend's by default (the gallery's samples). */
  load?: () => Promise<SearchIndex>;
};

/**
 * Search: a box, and an agenda of every event whose title, place or notes
 * the words start, opened at today. On a phone it is a page of its own,
 * the box on top so the results sit between it and the keyboard; on a wide
 * window a box over the blurred grid, as the editor is.
 */
export function SearchScreen({
  loaded,
  reload,
  roleOf,
  calendarName,
  onPick,
  onClose,
  covered,
  toast,
  load,
}: Props) {
  const wide = useIsWide();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const search = useEventSearch(query, loaded, reload, load);
  const words = useMemo(() => queryWords(query), [query]);
  const input = useRef<TextInput>(null);
  const list = useRef<FlatList<Row>>(null);

  const rows = useMemo<Row[]>(
    () =>
      search.rows.length === 0
        ? []
        : [
            {
              kind: 'edge',
              key: 'edge-earlier',
              label: search.earlierDone ? 'No earlier events' : '',
            },
            ...search.rows,
            {
              kind: 'edge',
              key: 'edge-later',
              label: search.laterDone ? 'No later events' : '',
            },
          ],
    [search.rows, search.earlierDone, search.laterDone]
  );
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const row of rows) {
      out.push(y);
      y += heightOf(row);
    }
    return out;
  }, [rows]);

  // Opens at today: once for each set of words, when its events land.
  const scrollY = useRef(0);
  /** The words the list was last opened at today for. */
  const anchored = useRef<string | null>(null);
  const key = words.join(' ');
  useLayoutEffect(() => {
    if (search.loading || rows.length === 0 || anchored.current === key) return;
    // The agenda's own index, past the edge row above it.
    const at = upcomingIndex(search.rows, new Date()) + 1;
    list.current?.scrollToOffset({ offset: offsets[at] ?? 0, animated: false });
    scrollY.current = offsets[at] ?? 0;
    anchored.current = key;
  }, [search.loading, search.rows, rows, offsets, key]);

  // Earlier events arrive above what is on screen: the list moves down by
  // what they added, so the rows being read stay where they were.
  const firstShown = useRef<{ key: string; offset: number } | null>(null);
  useLayoutEffect(() => {
    const was = firstShown.current;
    const first = rows.findIndex((r) => r.kind === 'event');
    firstShown.current =
      first < 0 ? null : { key: rows[first].key, offset: offsets[first] };
    if (!was || anchored.current !== key) return;
    const now = rows.findIndex((r) => r.key === was.key);
    if (now < 0) return;
    const delta = offsets[now] - was.offset;
    if (delta <= 0) return;
    scrollY.current += delta;
    list.current?.scrollToOffset({ offset: scrollY.current, animated: false });
  }, [rows, offsets, key]);

  // The wide window's keys: Up and Down walk the results, Enter opens one.
  const [picked, setPicked] = useState({ key, index: -1 });
  const selected = picked.key === key ? picked.index : -1;
  const setSelected = (index: number) => setPicked({ key, index });
  const eventIndexes = useMemo(
    () => rows.flatMap((r, i) => (r.kind === 'event' ? [i] : [])),
    [rows]
  );
  function step(by: 1 | -1) {
    if (eventIndexes.length === 0) return;
    const at = eventIndexes.indexOf(selected);
    const from =
      at >= 0
        ? at
        : Math.max(
            eventIndexes.findIndex((i) => offsets[i] >= scrollY.current) -
              (by > 0 ? 1 : 0),
            -1
          );
    const next =
      eventIndexes[Math.min(Math.max(from + by, 0), eventIndexes.length - 1)];
    setSelected(next);
    list.current?.scrollToIndex({ index: next, viewPosition: 0.5 });
  }

  useEscapeKey(onClose, !covered);
  // The web's Modal closes itself on Escape too, whatever lies over it: with
  // the editor open, one press closed both. Covered, the editor's it is.
  const closeOverlay = covered ? ignore : onClose;

  const field = (
    <View style={styles.fieldWrap}>
      <View style={styles.fieldIcon}>
        <SearchIcon
          size={18}
          color={wide ? theme.textSecondary : Colors.dark.textSecondary}
        />
      </View>
      <TextField
        ref={input}
        testID="search-input"
        value={query}
        onChangeText={setQuery}
        placeholder="Search events"
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search events"
        onKeyPress={(e) => {
          if (covered) return;
          const k = e.nativeEvent.key;
          if (k === 'ArrowDown' || k === 'ArrowUp') {
            e.preventDefault?.();
            step(k === 'ArrowDown' ? 1 : -1);
          }
        }}
        onSubmitEditing={() => {
          const row = rows[selected];
          if (row?.kind === 'event') onPick(row.event);
        }}
        style={[
          styles.field,
          !wide && {
            color: Colors.dark.text,
            backgroundColor: Colors.dark.backgroundSelected,
          },
        ]}
      />
      {query !== '' && (
        <Pressable
          onPress={() => {
            setQuery('');
            input.current?.clear();
            input.current?.focus();
          }}
          hitSlop={8}
          style={styles.clear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          testID="search-clear"
        >
          <XIcon
            size={18}
            color={wide ? theme.textSecondary : Colors.dark.textSecondary}
          />
        </Pressable>
      )}
    </View>
  );

  const body = (
    <View style={styles.body}>
      <LoadingBar visible={search.loading} />
      {search.partial && words.length > 0 && (
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.note}
          testID="search-partial"
        >
          Only months already loaded
        </ThemedText>
      )}
      {rows.length === 0 ? (
        words.length > 0 &&
        !search.loading && (
          <ThemedText
            themeColor="textSecondary"
            style={styles.empty}
            testID="search-empty"
          >
            Nothing matches
          </ThemedText>
        )
      ) : (
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(row) => row.key}
          getItemLayout={(_, index) => ({
            length: rows[index] ? heightOf(rows[index]) : 0,
            offset: offsets[index] ?? 0,
            index,
          })}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
            if (
              anchored.current === key &&
              scrollY.current < EARLIER_AT &&
              !search.earlierDone &&
              !search.loading
            )
              search.loadEarlier();
          }}
          scrollEventThrottle={32}
          onEndReached={() => {
            if (
              anchored.current === key &&
              !search.laterDone &&
              !search.loading
            )
              search.loadLater();
          }}
          onEndReachedThreshold={1}
          renderItem={({ item, index }) =>
            item.kind === 'event' ? (
              <ResultRow
                event={item.event}
                words={words}
                role={roleOf(item.event)}
                calendar={calendarName(item.event)}
                compact={!wide}
                selected={index === selected}
                onPress={() => onPick(item.event)}
              />
            ) : item.kind === 'month' ? (
              <View style={styles.month}>
                <ThemedText type="smallBold" style={styles.monthText}>
                  {item.label}
                </ThemedText>
              </View>
            ) : (
              <View style={styles.edge}>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.label}
                </ThemedText>
              </View>
            )
          }
          testID="search-results"
        />
      )}
    </View>
  );

  if (!wide)
    return (
      <Overlay label="Search" onClose={closeOverlay}>
        <ThemedView style={styles.page} testID="search-screen">
          <SafeAreaView
            style={styles.page}
            edges={['top', 'left', 'right', 'bottom']}
          >
            <View style={styles.bar}>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={styles.back}
                accessibilityRole="button"
                accessibilityLabel="Close search"
                testID="search-close"
              >
                <ChevronLeftIcon size={24} color={AccentColor} />
              </Pressable>
              {field}
            </View>
            {body}
          </SafeAreaView>
          {toast}
        </ThemedView>
      </Overlay>
    );

  return (
    <Overlay label="Search" onClose={closeOverlay}>
      <View style={[styles.backdrop, BACKDROP_BLUR]}>
        <BlurBackdrop />
        <View
          style={[StyleSheet.absoluteFill, styles.dismiss]}
          {...({ onClick: onClose } as object)}
        />
        <ThemedView style={styles.card} testID="search-screen">
          <View style={styles.cardBar}>{field}</View>
          {body}
        </ThemedView>
        {toast}
      </View>
    </Overlay>
  );
}

/** One result: its day and time, its title with the matched words marked,
 *  and its calendar (and place) beneath. A hidden calendar's is greyed with
 *  an eye-off mark, a discover event you are not going to has a dashed
 *  outline as on the grid, and a cancelled one is crossed out. */
function ResultRow({
  event,
  words,
  role,
  calendar,
  compact,
  selected,
  onPress,
}: {
  event: CalEvent;
  words: string[];
  role: CalendarRole;
  calendar?: string;
  compact: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tint = calendarTint(event.color);
  const hidden = role === 'hidden';
  const notGoing = role === 'tray' && event.free;
  const day = event.start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  });
  const second = [calendar, event.location].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.summary || '(untitled)'}, ${event.start.toLocaleDateString()}`}
      testID={`search-row-${event.id}`}
      style={({
        pressed,
        hovered,
      }: {
        pressed: boolean;
        hovered?: boolean;
      }) => [
        styles.row,
        { borderBottomColor: theme.rule },
        (pressed || hovered || selected) && {
          backgroundColor: theme.backgroundSelected,
        },
        hidden && styles.hidden,
      ]}
    >
      <View style={{ width: compact ? WHEN_COLUMN_COMPACT : WHEN_COLUMN }}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {day}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {event.allDay ? 'All day' : formatTime(event.start)}
        </ThemedText>
      </View>
      <View
        style={[
          styles.what,
          notGoing && [styles.notGoing, { borderColor: tint }],
        ]}
      >
        <ThemedText
          numberOfLines={1}
          style={[styles.title, event.cancelled && styles.cancelled]}
        >
          <Marked text={event.summary || '(untitled)'} words={words} />
        </ThemedText>
        <View style={styles.calendarLine}>
          <CalendarMark icon={event.icon} size={14} color={tint} />
          <ThemedText
            type="small"
            themeColor="textSecondary"
            numberOfLines={1}
            style={styles.calendarText}
          >
            {second}
          </ThemedText>
          {hidden && <EyeOffIcon size={14} color={theme.textSecondary} />}
        </View>
      </View>
    </Pressable>
  );
}

/** The text, with what the words matched set on the accent. */
function Marked({ text, words }: { text: string; words: string[] }) {
  const ranges = markRanges(text, words);
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <Text key={start} style={styles.mark}>
        {text.slice(start, end)}
      </Text>
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

const ignore = () => {};

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    backgroundColor: HEADER_GROUND,
  },
  back: {
    padding: 6,
  },
  fieldWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  field: {
    paddingLeft: 36,
    paddingRight: 36,
  },
  fieldIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
    pointerEvents: 'none',
  },
  clear: {
    position: 'absolute',
    right: 10,
    padding: 2,
  },
  body: {
    flex: 1,
  },
  note: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    paddingTop: Spacing.five,
  },
  month: {
    height: MONTH_HEIGHT,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
  },
  monthText: {
    color: AccentColor,
  },
  edge: {
    height: EDGE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    height: EVENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  hidden: {
    opacity: 0.5,
  },
  what: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  notGoing: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  title: {
    fontSize: 15,
    lineHeight: 21,
  },
  cancelled: {
    textDecorationLine: 'line-through',
  },
  mark: {
    backgroundColor: AccentColor,
    color: OnAccentColor,
  },
  calendarLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  calendarText: {
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    padding: Spacing.three,
    paddingTop: '10%',
  },
  dismiss: {
    cursor: 'pointer',
  },
  card: {
    width: '100%',
    maxWidth: 640,
    height: '75%',
    boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.75)',
  },
  cardBar: {
    padding: Spacing.three,
  },
});
