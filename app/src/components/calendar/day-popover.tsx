import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import { EventTags } from '@/components/calendar/event-tags';
import { TrashIcon } from '@/components/icons';
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
import { AccentColor, DangerColor, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useTheme } from '@/hooks/use-theme';
import { dayLabel, formatTime } from '@/utils/date';

/** The calendar mark beside a row's time. */
const MARK_SIZE = 16;
/** The time's line height, so the mark centres on its first line. */
const WHEN_LINE = 20;
/** The time column's width: the longest start and end ("→ 11:15 am") with the
 *  mark and the cell's padding, on any screen. */
const WHEN_COLUMN = 124;
/** The phone's: a notch smaller type, so the column and its lines follow. */
const WHEN_COLUMN_COMPACT = 112;
const WHEN_LINE_COMPACT = 18;

type Props = {
  /** The day (dateString) whose events are listed. */
  day: string;
  /** Every fetched event touching that day (incl. ones hidden by "+N more"). */
  events: CalEvent[];
  onClose: () => void;
  onPressEvent: (event: CalEvent) => void;
  /** Delete an event from the list: one tap, with the Undo bar to follow. */
  onDelete: (event: CalEvent) => void;
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
/** The time as lines: the start, then the end under it, so a column this
 *  narrow never has to cut either short. */
function whenLines(event: CalEvent): string[] {
  if (event.allDay) return ['All day'];
  return [formatTime(event.start), `→ ${formatTime(event.end)}`];
}

export function DayPopover({
  day,
  events,
  onClose,
  onPressEvent,
  onDelete,
  onAdd,
}: Props) {
  const theme = useTheme();
  const compact = !useIsWide();
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
                    labelWidth={compact ? WHEN_COLUMN_COMPACT : WHEN_COLUMN}
                    onPress={() => onPressEvent(event)}
                    pressLabel={event.summary || '(untitled)'}
                    trailing={
                      <Pressable
                        onPress={() => onDelete(event)}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${event.summary || 'event'}`}
                        testID={`day-popover-delete-${event.id}`}
                        style={({
                          pressed,
                          hovered,
                        }: {
                          pressed: boolean;
                          hovered?: boolean;
                        }) => [
                          styles.delete,
                          (pressed || hovered) && {
                            backgroundColor: theme.backgroundSelected,
                          },
                        ]}
                      >
                        <TrashIcon
                          size={compact ? 18 : 20}
                          color={DangerColor}
                        />
                      </Pressable>
                    }
                    label={
                      // When, with the source calendar's mark in its colour.
                      <View style={styles.when}>
                        <View
                          style={[
                            styles.mark,
                            compact && { height: WHEN_LINE_COMPACT },
                          ]}
                        >
                          <CalendarMark
                            icon={event.icon}
                            color={event.color ?? AccentColor}
                            size={MARK_SIZE}
                          />
                        </View>
                        <View>
                          {whenLines(event).map((line) => (
                            <ThemedText
                              key={line}
                              type="small"
                              themeColor="textSecondary"
                              style={[
                                styles.whenLine,
                                compact && styles.whenLineCompact,
                              ]}
                            >
                              {line}
                            </ThemedText>
                          ))}
                        </View>
                      </View>
                    }
                    value={
                      <View>
                        <ThemedText style={compact && styles.titleCompact}>
                          {event.summary || '(untitled)'}
                        </ThemedText>
                        <EventTags event={event} compact={compact} />
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
    maxWidth: 560,
    maxHeight: '80%',
  },
  // The settings card's hard offset shadow, on the outside edge: inside the
  // scroll area it was clipped, and at 2px black on the dimmed grid it did not
  // show.
  card: {
    maxHeight: '100%',
    boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.75)',
  },
  when: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one + Spacing.half,
  },
  delete: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    height: WHEN_LINE,
    justifyContent: 'center',
  },
  whenLine: {
    lineHeight: WHEN_LINE,
  },
  whenLineCompact: {
    fontSize: 12,
    lineHeight: WHEN_LINE_COMPACT,
  },
  titleCompact: {
    fontSize: 15,
    lineHeight: 21,
  },
});
