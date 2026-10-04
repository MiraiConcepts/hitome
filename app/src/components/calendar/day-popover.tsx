import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, Spacing } from '@/constants/theme';
import { dayLabel, formatTime } from '@/utils/date';

type Props = {
  /** The day (dateString) whose events are listed. */
  day: string;
  /** Every fetched event touching that day (incl. ones hidden by "+N more"). */
  events: CalEvent[];
  onClose: () => void;
  onPressEvent: (event: CalEvent) => void;
};

function compareEvents(a: CalEvent, b: CalEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.start.getTime() - b.start.getTime();
}

/**
 * The "+N more" popover: a centered modal (the app's dialog idiom, same as
 * EventEditor) listing one day's full event set; tapping a row opens the
 * edit editor via onPressEvent.
 */
export function DayPopover({ day, events, onClose, onPressEvent }: Props) {
  const sorted = [...events].sort(compareEvents);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Nested pressable claims card taps so they don't close the modal. */}
        <Pressable style={styles.cardWrap} onPress={() => {}}>
          <ThemedView
            type="backgroundElement"
            style={styles.card}
            testID="day-popover"
          >
            <ThemedText type="smallBold" style={styles.title}>
              {dayLabel(day)} ▪ {sorted.length}{' '}
              {sorted.length === 1 ? 'event' : 'events'}
            </ThemedText>
            <ScrollView contentContainerStyle={styles.list}>
              {sorted.map((event) => (
                <Pressable key={event.id} onPress={() => onPressEvent(event)}>
                  {({ pressed }) => (
                    <ThemedView
                      type={
                        pressed ? 'backgroundSelected' : 'backgroundElement'
                      }
                      style={styles.row}
                    >
                      {/* Source-calendar color accent (theme accent if none). */}
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: event.color ?? AccentColor },
                        ]}
                      />
                      <View style={styles.time}>
                        {event.allDay ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            All day
                          </ThemedText>
                        ) : (
                          <>
                            <ThemedText type="small">
                              {formatTime(event.start)}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {formatTime(event.end)}
                            </ThemedText>
                          </>
                        )}
                      </View>
                      <View style={styles.body}>
                        <ThemedText numberOfLines={1}>
                          {event.summary || '(untitled)'}
                        </ThemedText>
                        {event.location ? (
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                            numberOfLines={1}
                          >
                            {event.location}
                          </ThemedText>
                        ) : null}
                      </View>
                    </ThemedView>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
  },
  card: {
    padding: Spacing.three,
    gap: Spacing.two,
    maxHeight: '100%',
  },
  title: {
    paddingHorizontal: Spacing.one,
  },
  list: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.two,
  },
  dot: {
    width: 6,
    height: 6,
    marginTop: 5, // sit level with the first text line
  },
  time: {
    width: 52,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
});
