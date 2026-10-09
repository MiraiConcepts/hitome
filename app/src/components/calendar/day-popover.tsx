import { useEffect, type ReactNode } from 'react';
import {
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { BlurBackdrop } from '@/components/blur-backdrop';
import { EventTags } from '@/components/calendar/event-tags';
import { ShareIcon, TrashIcon } from '@/components/icons';
import {
  SettingsBlock,
  SettingsButton,
  SettingsButtonRow,
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BACKDROP_BLUR, MODAL_ANIMATION } from '@/constants/backdrop';
import { AccentColor, DangerColor, Spacing } from '@/constants/theme';
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
/** The column holding Share and Delete: two 48 px targets side by side. */
const ACTIONS_WIDTH = 96;

type Props = {
  /** The day (dateString) whose events are listed. */
  day: string;
  /** Every fetched event touching that day (incl. ones hidden by "+N more"). */
  events: CalEvent[];
  onClose: () => void;
  onPressEvent: (event: CalEvent) => void;
  /** Delete an event from the list: one tap, with the Undo bar to follow. */
  onDelete: (event: CalEvent) => void;
  /** Share an event as text (the system sheet, or the clipboard on the web). */
  onShare: (event: CalEvent) => void;
  /** A new event on this day. A hold on a cell does it too, but nothing says
   *  so: a busy day's list is where a person looks for the button. */
  onAdd: () => void;
};

/**
 * The dialog's layer. A Modal everywhere but Android, where it is a layer over
 * the month screen in the app's own window instead: a Modal is a window of its
 * own there, and the blur behind the popover can only reach what is in this
 * one. It sits outside the screen's blur target, as a sibling after it.
 */
function Overlay({
  label,
  onClose,
  children,
}: {
  /** The dialog's name: the day, as its heading says it. */
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (Platform.OS === 'android')
    return <AndroidOverlay onClose={onClose}>{children}</AndroidOverlay>;
  return (
    <Modal
      visible
      transparent
      animationType={MODAL_ANIMATION}
      onRequestClose={onClose}
      // The web's Modal passes this on to its role=dialog element.
      {...({ 'aria-label': label } as object)}
    >
      {children}
    </Modal>
  );
}

function AndroidOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  // The back button closes it, as it does a Modal.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);
  return <View style={StyleSheet.absoluteFill}>{children}</View>;
}

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
  onShare,
  onAdd,
}: Props) {
  const theme = useTheme();
  const compact = !useIsWide();
  const sorted = [...events].sort(compareEvents);
  return (
    <Overlay label={dayLabel(day)} onClose={onClose}>
      <View style={[styles.backdrop, BACKDROP_BLUR]}>
        <BlurBackdrop />
        {/* The backdrop is a layer behind the card, not around it: wrapped,
            every row became a button inside a button, which the web
            rejects as invalid HTML. */}
        {Platform.OS === 'web' ? (
          // Not a keyboard stop, nor focusable at all: the dialog focuses
          // its first focusable element on opening, and a Pressable is one
          // whatever its tabIndex, so the focus landed on a full-screen
          // "Close" instead of the list. A plain click does it here; Escape
          // closes it from the keyboard.
          <View
            style={[StyleSheet.absoluteFill, styles.dismiss]}
            {...({ onClick: onClose } as object)}
          />
        ) : (
          // TalkBack's way out besides Back: a Close it can find.
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            focusable={false}
            accessibilityLabel="Close"
          />
        )}
        <View style={styles.cardWrap}>
          <ThemedView style={styles.card} testID="day-popover">
            <ScrollView>
              <SettingsSection title={dayLabel(day)} large>
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
                      trailingWidth={ACTIONS_WIDTH}
                      trailing={
                        <View style={styles.actions}>
                          <Pressable
                            onPress={() => onShare(event)}
                            accessibilityRole="button"
                            accessibilityLabel={`Share ${event.summary || 'event'}`}
                            testID={`day-popover-share-${event.id}`}
                            style={({
                              pressed,
                              hovered,
                            }: {
                              pressed: boolean;
                              hovered?: boolean;
                            }) => [
                              styles.action,
                              (pressed || hovered) && {
                                backgroundColor: theme.backgroundSelected,
                              },
                            ]}
                          >
                            <ShareIcon
                              size={compact ? 18 : 20}
                              color={AccentColor}
                            />
                          </Pressable>
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
                              styles.action,
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
                        </View>
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
                        // No view of its own around these: the cell lets a
                        // press through its gaps to the row's button, and a
                        // plain view would take it.
                        <>
                          <ThemedText
                            style={[
                              styles.title,
                              compact && styles.titleCompact,
                            ]}
                          >
                            {event.summary || '(untitled)'}
                          </ThemedText>
                          <EventTags event={event} />
                        </>
                      }
                    />
                  );
                })}
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
              </SettingsSection>
            </ScrollView>
          </ThemedView>
        </View>
      </View>
    </Overlay>
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
  // The Pressable this replaced on the web showed the hand; so does this.
  dismiss: {
    cursor: 'pointer',
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
  actions: {
    flex: 1,
    flexDirection: 'row',
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Not a press target of its own: the row's button, behind it, takes the press.
  title: {
    fontSize: ROW_FONT,
    lineHeight: ROW_LINE,
    pointerEvents: 'none',
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
