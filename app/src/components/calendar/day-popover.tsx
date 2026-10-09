import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import { EventTags } from '@/components/calendar/event-tags';
import {
  SettingsBlock,
  SettingsButton,
  SettingsButtonRow,
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BACKDROP_BLUR } from '@/constants/backdrop';
import { AccentColor, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { dayLabel, formatTime, timeSpan } from '@/utils/date';

/** The calendar mark beside a row's time. */
const MARK_SIZE = 16;

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
 * edit editor via onPressEvent. Drawn as the settings screen's card: the
 * day is the title row, each event a ruled row beneath it.
 */
function whenLabel(event: CalEvent, wide: boolean): string {
  if (event.allDay) return 'All day';
  const start = formatTime(event.start);
  const end = formatTime(event.end);
  // The arrow's room is the phone's to spare.
  return wide ? timeSpan(start, end) : `${start}–${end}`;
}

export function DayPopover({
  day,
  events,
  onClose,
  onPressEvent,
  onAdd,
}: Props) {
  const isWide = useIsWide();
  const sorted = [...events].sort(compareEvents);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, BACKDROP_BLUR]}>
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
          <ThemedView style={styles.card} testID="day-popover">
            <ScrollView>
              <SettingsSection title={dayLabel(day)}>
                {sorted.map((event) => (
                  <SettingsValue
                    key={event.id}
                    labelWidth={isWide ? '38%' : '42%'}
                    onPress={() => onPressEvent(event)}
                    pressLabel={event.summary || '(untitled)'}
                    label={
                      // When, with the source calendar's mark in its colour.
                      <View style={styles.when}>
                        <CalendarMark
                          icon={event.icon}
                          color={event.color ?? AccentColor}
                          size={MARK_SIZE}
                        />
                        <ThemedText
                          type="small"
                          themeColor="textSecondary"
                          numberOfLines={1}
                        >
                          {whenLabel(event, isWide)}
                        </ThemedText>
                      </View>
                    }
                    value={
                      <View>
                        <ThemedText numberOfLines={2}>
                          {event.summary || '(untitled)'}
                        </ThemedText>
                        <EventTags event={event} />
                      </View>
                    }
                  />
                ))}
                {onAdd && (
                  <SettingsBlock>
                    <SettingsButtonRow>
                      <SettingsButton
                        label="Add event"
                        variant="filled"
                        onPress={onAdd}
                        testID="day-popover-add"
                      />
                    </SettingsButtonRow>
                  </SettingsBlock>
                )}
              </SettingsSection>
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
    maxWidth: 420,
    maxHeight: '80%',
  },
  card: {
    maxHeight: '100%',
  },
  when: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
});
