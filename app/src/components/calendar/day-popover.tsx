import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import { SettingsButton } from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  AccentColor,
  FontFamilyBold,
  OnAccentColor,
  Spacing,
} from '@/constants/theme';
import { dayLabel, formatTime, timeSpan } from '@/utils/date';

/** The calendar mark beside a row's time; its box is the time's line
 *  height, so the glyph centres on that line at any size. */
const MARK_SIZE = 16;
const WHEN_LINE = 20;

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
            {/* An accent band, so the card reads as lifted off the grid
                rather than one more dark cell. */}
            <View style={styles.header}>
              <ThemedText style={styles.headerText}>{dayLabel(day)}</ThemedText>
            </View>
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
                      {/* Agenda order: when (with the source calendar's
                          mark, in its colour), then what, then where. */}
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
                            : timeSpan(
                                formatTime(event.start),
                                formatTime(event.end)
                              )}
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
    // Solid at zero width: Chrome draws its 'auto' focus ring whatever the
    // width says, so the style has to change too.
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
  },
  card: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
    maxHeight: '100%',
  },
  header: {
    backgroundColor: AccentColor,
    paddingHorizontal: Spacing.three,
    // A point higher than even: centres the capitals (measured on device),
    // which is what the eye reads, not the line box.
    paddingTop: Spacing.four - Spacing.one - 1,
    paddingBottom: Spacing.four - Spacing.one + 1,
  },
  headerText: {
    color: OnAccentColor,
    fontFamily: FontFamilyBold,
    fontSize: 24,
    lineHeight: 30,
    // Android pads the line for accents the date never has, and the date
    // sat low in the band; without it equal padding reads as centred.
    includeFontPadding: false,
  },
  list: {
    gap: Spacing.one,
  },
  // Full width, so a pressed row lights edge to edge; its inset matches the
  // header's, so the marks line up under the date.
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.three,
  },
});
