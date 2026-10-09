import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { CalEvent } from '@/caldav/types';
import {
  compareEvents,
  DayEventRow,
} from '@/components/calendar/day-event-row';
import { AddIcon, CloseIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  AccentColor,
  FontFamilyBold,
  OnAccentColor,
  Spacing,
} from '@/constants/theme';
import { dayLabel } from '@/utils/date';

/** How wide the panel stands beside the grid. */
export const DAY_PANEL_WIDTH = 320;

/** How long the panel takes to open, and to close (a little quicker). */
const OPEN_MS = 180;
const CLOSE_MS = 140;

type Props = {
  /** The day (dateString) whose events are listed; null when closed. */
  day: string | null;
  /** Every fetched event touching that day. */
  events: CalEvent[];
  onClose: () => void;
  onPressEvent: (event: CalEvent) => void;
  onAdd: () => void;
};

/**
 * The day's list on a wide window: a panel beside the grid, not a dialog over
 * it, so the month stays in view and in reach while one day is read. It lists
 * the day in full, so a busy day is a scroll here, never a "+N more".
 *
 * Always mounted on a wide window, and opened by giving it a day: its width
 * runs from nothing to DAY_PANEL_WIDTH, and the grid beside it gives way as it
 * goes. The panel itself stays put against the right edge and is uncovered,
 * not pushed in, so its text never reflows on the way. It keeps the last day
 * it showed while it closes.
 */
export function DayPanel({ day, events, onClose, onPressEvent, onAdd }: Props) {
  const open = day !== null;
  const [shown, setShown] = useState<{
    day: string;
    events: CalEvent[];
  } | null>(null);
  if (day !== null && (shown?.day !== day || shown.events !== events))
    setShown({ day, events });

  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(open ? DAY_PANEL_WIDTH : 0, {
      duration: open ? OPEN_MS : CLOSE_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [open, width]);
  const widthStyle = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Animated.View
      style={[styles.reveal, widthStyle]}
      pointerEvents={open ? 'auto' : 'none'}
    >
      {shown && (
        <Panel
          day={shown.day}
          events={shown.events}
          onClose={onClose}
          onPressEvent={onPressEvent}
          onAdd={onAdd}
        />
      )}
    </Animated.View>
  );
}

function Panel({
  day,
  events,
  onClose,
  onPressEvent,
  onAdd,
}: Omit<Props, 'day'> & { day: string }) {
  const sorted = [...events].sort(compareEvents);
  return (
    <ThemedView
      type="backgroundElement"
      style={styles.panel}
      testID="day-panel"
    >
      <View style={styles.header}>
        <ThemedText style={styles.headerText} numberOfLines={1}>
          {dayLabel(day)}
        </ThemedText>
        <View style={styles.controls}>
          <Pressable
            onPress={onAdd}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add event"
            testID="day-panel-add"
          >
            <AddIcon size={28} color={OnAccentColor} />
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="day-panel-close"
          >
            <CloseIcon size={28} color={OnAccentColor} />
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {sorted.length === 0 ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.empty}
          >
            Nothing on this day.
          </ThemedText>
        ) : (
          sorted.map((event) => (
            <DayEventRow key={event.id} event={event} onPress={onPressEvent} />
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  reveal: {
    overflow: 'hidden',
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DAY_PANEL_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#60646C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    backgroundColor: AccentColor,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four - Spacing.one,
  },
  headerText: {
    flexShrink: 1,
    color: OnAccentColor,
    fontFamily: FontFamilyBold,
    fontSize: 24,
    lineHeight: 30,
    includeFontPadding: false,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  empty: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
