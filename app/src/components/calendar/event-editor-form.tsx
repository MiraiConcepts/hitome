import type { ComponentType, Ref } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { AlarmField } from '@/components/calendar/alarm-field';
import { CalendarField } from '@/components/calendar/calendar-field';
import { LocationField } from '@/components/calendar/location-field';
import { HEADER_GROUND } from '@/components/calendar/month-header';
import { RecurrenceField } from '@/components/calendar/recurrence-field';
import type { EventEditorController } from '@/components/calendar/use-event-editor';
import { DateField } from '@/components/fields/date-field';
import { FieldRow } from '@/components/fields/field-row';
import { TextField } from '@/components/fields/text-field';
import { TimeField } from '@/components/fields/time-field';
import { ThemedText } from '@/components/themed-text';
import {
  AccentColor,
  DangerColor,
  FontFamilyBold,
  OnAccentColor,
  Spacing,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dayLabel, parseDay } from '@/utils/date';

export type { EditorResult } from '@/components/calendar/use-event-editor';

/**
 * The editor's three pieces. Shells lay them out — the header pinned at the
 * top, the fields scrolling, the actions pinned at the bottom (above the
 * keyboard in the sheet) — so Save is reachable from any field without
 * scrolling the form or dismissing the keyboard first.
 *
 * Density is the point: 36pt fields, 28pt chips, labels beside controls
 * and a 10pt rhythm put a new event on one phone screen. A long form (many
 * calendars, a repeat with an end date) still scrolls.
 */

/** The header's measurements — the month header's bar, scaled to a sheet. */
const Bar = {
  paddingHorizontal: Spacing.four - Spacing.one,
  paddingTop: Spacing.two,
  paddingBottom: Spacing.three - Spacing.one,
  titleSize: 20,
  titleLineRatio: 1.3,
  subtitleSize: 12,
  labelGap: Spacing.half,
} as const;

/** Days an all-day event covers, inclusive of both ends; 1 for a single day. */
function spanDays(startDay: string, endDay: string): number {
  const start = parseDay(startDay);
  const end = parseDay(endDay);
  if (!start || !end) return 1;
  return Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  );
}

/** The header's second line: what kind of edit this is, and when the event
 *  runs — read live from the fields, so it doubles as a summary of them. */
function whenLabel(editor: EventEditorController): string {
  const mode = editor.event ? 'Edit event' : 'New event';
  if (editor.allDay) {
    const days = spanDays(editor.startDay, editor.endDay);
    return days > 1 ? `${mode} · All day · ${days} days` : `${mode} · All day`;
  }
  const sameDay = editor.endDay === editor.startDay;
  const end = sameDay
    ? editor.endTime
    : `${dayLabel(editor.endDay)} ${editor.endTime}`;
  return `${mode} · ${editor.startTime} – ${end}`;
}

/**
 * The date-as-title header: the month header's idiom (accent ink, bold, on
 * the black header ground), with a live line under it summarising the event's
 * timing. Shells pin it above the scrolling fields.
 */
export function EventEditorHeader({
  editor,
}: {
  editor: EventEditorController;
}) {
  return (
    <View style={styles.header}>
      <ThemedText style={styles.headerTitle} testID="editor-title">
        {dayLabel(editor.headerDay)}
      </ThemedText>
      <ThemedText style={styles.headerSubtitle} numberOfLines={1}>
        {whenLabel(editor)}
      </ThemedText>
    </View>
  );
}

type FieldsProps = {
  editor: EventEditorController;
  /** Sheet shell passes BottomSheetTextInput for keyboard-aware inputs. */
  TextInputComponent?: ComponentType<TextInputProps>;
  /** The title input, for a shell that focuses it itself (the sheet, once
   *  it has settled — focusing during the slide-in raises the keyboard
   *  mid-animation and, on web, scrolls the modal host off its bottom). */
  titleRef?: Ref<TextInput>;
  /** Focus the title on mount — the dialog shell, which does not move. */
  autoFocusTitle?: boolean;
  /** A field at the tail of the form (location, notes) took focus — the
   *  sheet scrolls it out from under the keyboard. */
  onFocusTail?: () => void;
};

/** Every field, in order. The scrolling part of the editor. */
export function EventEditorFields({
  editor,
  TextInputComponent,
  titleRef,
  autoFocusTitle = false,
  onFocusTail,
}: FieldsProps) {
  const theme = useTheme();
  const {
    event,
    summary,
    setSummary,
    allDay,
    setAllDay,
    startDay,
    startTime,
    endDay,
    endTime,
    moveStart,
    setEndDay,
    setEndTime,
    calendars,
    calendarUrl,
    setCalendarUrl,
    headerDay,
  } = editor;

  return (
    <View style={styles.fields}>
      <TextField
        ref={titleRef}
        TextInputComponent={TextInputComponent}
        style={styles.titleInput}
        value={summary}
        onChangeText={setSummary}
        placeholder="Title"
        autoFocus={autoFocusTitle}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        testID="editor-summary"
      />

      {!event && calendars.length > 1 && calendarUrl && (
        <CalendarField
          calendars={calendars}
          value={calendarUrl}
          onChange={setCalendarUrl}
          testID="editor-calendar"
        />
      )}

      <FieldRow label="Starts">
        <View style={styles.row}>
          <View style={styles.dateCell}>
            <DateField
              value={startDay}
              onChange={(d) => moveStart(d, startTime)}
              testID="editor-start-date"
            />
          </View>
          {!allDay && (
            <View style={styles.timeCell}>
              <TimeField
                value={startTime}
                onChange={(t) => moveStart(startDay, t)}
                testID="editor-start-time"
              />
            </View>
          )}
        </View>
      </FieldRow>

      <FieldRow label="Ends">
        <View style={styles.row}>
          <View style={styles.dateCell}>
            <DateField
              value={endDay}
              min={startDay}
              onChange={setEndDay}
              testID="editor-end-date"
            />
          </View>
          {!allDay && (
            <View style={styles.timeCell}>
              <TimeField
                value={endTime}
                onChange={setEndTime}
                testID="editor-end-time"
              />
            </View>
          )}
        </View>
      </FieldRow>

      {/* A small right-aligned toggle under the times — the label is the
          target too, so the row is easy to hit without being a bar. */}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: allDay }}
        onPress={() => setAllDay(!allDay)}
        hitSlop={6}
        style={styles.switchRow}
      >
        <ThemedText type="small" style={styles.switchLabel}>
          All-day
        </ThemedText>
        <Switch
          value={allDay}
          onValueChange={setAllDay}
          trackColor={{ true: AccentColor, false: theme.backgroundSelected }}
          thumbColor={allDay ? OnAccentColor : theme.textSecondary}
          {...Platform.select({
            web: { activeThumbColor: OnAccentColor },
            default: {},
          })}
          style={styles.switch}
          testID="editor-all-day"
        />
      </Pressable>

      <RecurrenceField
        value={editor.recurrence}
        onChange={editor.setRecurrence}
        startDay={headerDay}
        TextInputComponent={TextInputComponent}
        testID="editor-repeat"
      />

      <AlarmField
        value={editor.alarm}
        onChange={editor.setAlarm}
        allDay={allDay}
        hint={editor.alarmHint}
        testID="editor-alert"
      />

      <LocationField
        value={editor.location}
        onChange={editor.setLocation}
        TextInputComponent={TextInputComponent}
        onFocus={onFocusTail}
        testID="editor-location"
      />

      <TextField
        TextInputComponent={TextInputComponent}
        style={styles.notes}
        value={editor.description}
        onChangeText={editor.setDescription}
        placeholder="Notes"
        onFocus={onFocusTail}
        multiline
        testID="editor-notes"
      />
    </View>
  );
}

type ActionsProps = {
  editor: EventEditorController;
  onClose: () => void;
  /** Extra room under the buttons — the sheet passes the gesture-bar inset. */
  bottomInset?: number;
};

/**
 * The action bar: Delete on the left (edit only), Cancel and Save on the
 * right. A validation problem shows here, above the buttons, so it is in
 * view at the moment Save is pressed rather than somewhere up the form.
 */
export function EventEditorActions({
  editor,
  onClose,
  bottomInset = 0,
}: ActionsProps) {
  const theme = useTheme();
  const { event, busy, problem, save, remove } = editor;
  return (
    <View
      style={[
        styles.actions,
        {
          backgroundColor: theme.background,
          borderTopColor: DIVIDER,
          paddingBottom: styles.actions.paddingVertical + bottomInset,
        },
      ]}
    >
      {problem && (
        <ThemedText type="small" style={styles.problem} testID="editor-problem">
          {problem}
        </ThemedText>
      )}
      <View style={styles.actionRow}>
        {event && (
          <Pressable
            onPress={remove}
            disabled={busy}
            hitSlop={8}
            style={({ pressed }) => [
              styles.textButton,
              pressed && { backgroundColor: theme.backgroundSelected },
              busy && styles.disabled,
            ]}
            testID="editor-delete"
          >
            <ThemedText type="smallBold" style={{ color: DangerColor }}>
              {event.recurring ? 'Delete series' : 'Delete'}
            </ThemedText>
          </Pressable>
        )}
        <View style={styles.actionsRight}>
          <Pressable
            onPress={onClose}
            disabled={busy}
            style={({ pressed }) => [
              styles.textButton,
              pressed && { backgroundColor: theme.backgroundSelected },
              busy && styles.disabled,
            ]}
            testID="editor-cancel"
          >
            <ThemedText type="smallBold" themeColor="textSecondary">
              Cancel
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={busy}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              busy && styles.disabled,
            ]}
            testID="editor-save"
          >
            <ThemedText type="smallBold" style={styles.saveLabel}>
              {busy ? 'Saving…' : 'Save'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** The rule above the action bar — the grid's and the widget's divider grey,
 *  which reads on either scheme. */
const DIVIDER = '#60646C';

/** Every button in the action bar is this tall. */
const BUTTON_HEIGHT = 36;

const styles = StyleSheet.create({
  header: {
    backgroundColor: HEADER_GROUND,
    paddingHorizontal: Bar.paddingHorizontal,
    paddingTop: Bar.paddingTop,
    paddingBottom: Bar.paddingBottom,
    gap: Bar.labelGap,
  },
  headerTitle: {
    fontFamily: FontFamilyBold,
    color: AccentColor,
    fontSize: Bar.titleSize,
    lineHeight: Math.round(Bar.titleSize * Bar.titleLineRatio),
  },
  headerSubtitle: {
    color: AccentColor,
    fontSize: Bar.subtitleSize,
    lineHeight: Bar.subtitleSize + 4,
  },
  fields: {
    paddingHorizontal: Bar.paddingHorizontal,
    paddingTop: Spacing.three - Spacing.half,
    paddingBottom: Spacing.two,
    gap: Spacing.two + Spacing.half,
  },
  titleInput: {
    minHeight: 40,
    fontSize: 17,
  },
  notes: {
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dateCell: {
    flex: 3,
  },
  timeCell: {
    flex: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: -Spacing.one,
  },
  switchLabel: {
    fontSize: 13,
    lineHeight: 16,
  },
  switch: {
    // The native track is a generous 48×24 on Android; 3/4 of that sits
    // level with the 13pt label without changing its hit area.
    transform: [{ scale: Platform.OS === 'web' ? 1 : 0.8 }],
    marginVertical: -4,
  },
  actions: {
    paddingHorizontal: Bar.paddingHorizontal,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  problem: {
    color: DangerColor,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one + Spacing.half,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    marginLeft: 'auto',
  },
  textButton: {
    minHeight: BUTTON_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
  },
  saveButton: {
    minHeight: BUTTON_HEIGHT,
    justifyContent: 'center',
    backgroundColor: AccentColor,
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.four - Spacing.half,
  },
  saveButtonPressed: {
    opacity: 0.85,
  },
  saveLabel: {
    color: OnAccentColor,
    fontFamily: FontFamilyBold,
  },
  disabled: {
    opacity: 0.5,
  },
});
