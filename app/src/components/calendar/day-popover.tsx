import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import { SettingsButton } from '@/components/settings/settings-parts';
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
  /** A new event on this day. Given on the web, where a click on a busy day
   *  lands here and there is no hold to add with; the phone holds the cell. */
  onAdd?: () => void;
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
export function DayPopover({
  day,
  events,
  onClose,
  onPressEvent,
  onAdd,
}: Props) {
  const sorted = [...events].sort(compareEvents);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* The backdrop is a layer behind the card, not around it: wrapped,
            every row became a button inside a button, which the web
            rejects as invalid HTML. */}
        {/* Not a keyboard stop: the dialog focuses its first stop on
            opening, and a full-screen one wore the focus ring as a frame
            round the page. Escape closes it from the keyboard. */}
        <Pressable
          style={[StyleSheet.absoluteFill, styles.dismiss]}
          onPress={onClose}
          focusable={false}
          accessibilityLabel="Close"
        />
        <View style={styles.cardWrap}>
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
                <Pressable
                  key={event.id}
                  onPress={() => onPressEvent(event)}
                  accessibilityRole="button"
                  accessibilityLabel={event.summary}
                >
                  {/* `hovered` is react-native-web's; it never sets on a
                      phone. */}
                  {({
                    pressed,
                    hovered,
                  }: {
                    pressed: boolean;
                    hovered?: boolean;
                  }) => (
                    <ThemedView
                      type={
                        pressed || hovered
                          ? 'backgroundSelected'
                          : 'backgroundElement'
                      }
                      style={styles.row}
                    >
                      {/* Source calendar's mark, in its color (theme accent
                          if none). */}
                      <View style={styles.mark}>
                        <CalendarMark
                          icon={event.icon}
                          color={event.color ?? AccentColor}
                        />
                      </View>
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
            {onAdd && (
              <View style={styles.actions}>
                <SettingsButton
                  label="Add event"
                  onPress={onAdd}
                  testID="day-popover-add"
                />
              </View>
            )}
          </ThemedView>
        </View>
      </View>
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
  // The dialog still focuses this layer when it opens from the keyboard; it
  // is the whole screen, so a ring on it would frame the page.
  dismiss: {
    outlineWidth: 0,
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
  mark: {
    marginTop: 3, // sit level with the first text line
  },
  time: {
    width: 52,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
