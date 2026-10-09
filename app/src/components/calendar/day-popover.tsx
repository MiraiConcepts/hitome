import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
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
import { MODAL_ANIMATION, useBackdropFade } from '@/constants/backdrop';
import { DangerColor, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useTheme } from '@/hooks/use-theme';
import { dayLabel, formatTime } from '@/utils/date';
import { durationLabel } from '@/utils/duration';

/** A row's padding: the same on the value's two sides, and the same above and
 *  below in the time cell and the title's, so the two first lines align. */
const ROW_PAD_X = 16;
const ROW_PAD_Y = 12;
/** The title and the time are one size: a row reads as one line of type. */
const ROW_FONT = 15;
const ROW_LINE = 21;
const ROW_FONT_COMPACT = 14;
const ROW_LINE_COMPACT = 20;
/** The time column: a start time and a duration are short, so it is narrow,
 *  but wide enough for the widest ("11:00 am", bold) on one line. */
const WHEN_COLUMN = 108;
/** The phone's: a notch smaller type, so the column follows. */
const WHEN_COLUMN_COMPACT = 94;

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
 * day is the title row, each event a ruled row beneath it, with its start
 * and length on the left, its title and tags in the middle, and a delete.
 */
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
  const fade = useBackdropFade();
  const sorted = [...events].sort(compareEvents);
  return (
    <Modal
      visible
      transparent
      animationType={MODAL_ANIMATION}
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, fade]}>
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
                {sorted.map((event) => {
                  const duration = durationLabel(
                    event.start,
                    event.end,
                    event.allDay
                  );
                  return (
                    <SettingsValue
                      key={event.id}
                      labelWidth={compact ? WHEN_COLUMN_COMPACT : WHEN_COLUMN}
                      cellPaddingY={ROW_PAD_Y}
                      valuePaddingX={ROW_PAD_X}
                      centerValue
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
                        // When: the start, and how long it runs.
                        <View>
                          <ThemedText
                            type="smallBold"
                            style={[styles.when, compact && styles.whenCompact]}
                          >
                            {event.allDay ? 'All day' : formatTime(event.start)}
                          </ThemedText>
                          {duration ? (
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                              style={[
                                styles.when,
                                compact && styles.whenCompact,
                              ]}
                            >
                              {duration}
                            </ThemedText>
                          ) : null}
                        </View>
                      }
                      value={
                        <View>
                          <ThemedText
                            style={[
                              styles.title,
                              compact && styles.titleCompact,
                            ]}
                          >
                            {event.summary || '(untitled)'}
                          </ThemedText>
                          <EventTags event={event} />
                        </View>
                      }
                    />
                  );
                })}
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
  delete: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: ROW_FONT,
    lineHeight: ROW_LINE,
  },
  titleCompact: {
    fontSize: ROW_FONT_COMPACT,
    lineHeight: ROW_LINE_COMPACT,
  },
  when: {
    fontSize: ROW_FONT,
    lineHeight: ROW_LINE,
  },
  whenCompact: {
    fontSize: ROW_FONT_COMPACT,
    lineHeight: ROW_LINE_COMPACT,
  },
});
