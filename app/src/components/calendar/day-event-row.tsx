import { Pressable, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, Spacing } from '@/constants/theme';
import { formatTime, timeSpan } from '@/utils/date';

/** The calendar mark beside a row's time; its box is the time's line
 *  height, so the glyph centres on that line at any size. */
export const MARK_SIZE = 16;
const WHEN_LINE = 20;

/** All-day first, then by start. */
export function compareEvents(a: CalEvent, b: CalEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.start.getTime() - b.start.getTime();
}

/**
 * One event in a day's list, for the popover and the side panel alike:
 * when (with the source calendar's mark, in its colour), then what, then
 * where. Full width, so a pressed row lights edge to edge.
 */
export function DayEventRow({
  event,
  onPress,
}: {
  event: CalEvent;
  onPress: (event: CalEvent) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(event)}
      accessibilityRole="button"
      accessibilityLabel={event.summary}
    >
      {/* `hovered` is react-native-web's; it never sets on a phone. */}
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <ThemedView
          type={pressed || hovered ? 'backgroundSelected' : 'backgroundElement'}
          style={styles.row}
        >
          <View style={styles.when}>
            <View style={styles.mark}>
              <CalendarMark
                icon={event.icon}
                color={event.color ?? AccentColor}
                size={MARK_SIZE}
              />
            </View>
            <ThemedText type="small" style={styles.whenText}>
              {event.allDay
                ? 'All day'
                : timeSpan(formatTime(event.start), formatTime(event.end))}
            </ThemedText>
          </View>
          <ThemedText style={styles.indent} numberOfLines={1}>
            {event.summary || '(untitled)'}
          </ThemedText>
          {event.location ? (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.indent}
              numberOfLines={1}
            >
              {event.location}
            </ThemedText>
          ) : null}
        </ThemedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Its inset matches the header's, so the marks line up under the date.
  row: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  when: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  mark: {
    height: WHEN_LINE,
    justifyContent: 'center',
  },
  whenText: {
    color: AccentColor,
    lineHeight: WHEN_LINE,
  },
  // Title and place sit under the time, past the mark.
  indent: {
    paddingLeft: MARK_SIZE + Spacing.two,
  },
});
