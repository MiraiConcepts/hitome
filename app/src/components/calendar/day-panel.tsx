import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

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

type Props = {
  /** The day (dateString) whose events are listed. */
  day: string;
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
 */
export function DayPanel({ day, events, onClose, onPressEvent, onAdd }: Props) {
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
  panel: {
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
