import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import {
  compareEvents,
  DayEventRow,
} from '@/components/calendar/day-event-row';
import { AddIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  AccentColor,
  FontFamilyBold,
  OnAccentColor,
  Spacing,
} from '@/constants/theme';
import { dayLabel } from '@/utils/date';

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
              {onAdd && (
                <Pressable
                  onPress={onAdd}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Add event"
                  testID="day-popover-add"
                >
                  <AddIcon size={28} color={OnAccentColor} />
                </Pressable>
              )}
            </View>
            <ScrollView contentContainerStyle={styles.list}>
              {sorted.map((event) => (
                <DayEventRow
                  key={event.id}
                  event={event}
                  onPress={onPressEvent}
                />
              ))}
            </ScrollView>
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
    paddingBottom: Spacing.two,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
});
