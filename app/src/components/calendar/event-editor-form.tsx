import type { ComponentType, Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AlarmField } from '@/components/calendar/alarm-field';
import { CalendarField } from '@/components/calendar/calendar-field';
import { LocationField } from '@/components/calendar/location-field';
import { HEADER_GROUND } from '@/components/calendar/month-header';
import { RecurrenceField } from '@/components/calendar/recurrence-field';
import type { EventEditorController } from '@/components/calendar/use-event-editor';
import type { EditScope } from '@/caldav/events';
import { DateField } from '@/components/fields/date-field';
import { FieldStack } from '@/components/fields/field-stack';
import { TextField } from '@/components/fields/text-field';
import { TimeField } from '@/components/fields/time-field';
import {
  CalendarIcon,
  ClockPlayIcon,
  ClockStopIcon,
  MapPinIcon,
  NotesIcon,
  PencilIcon,
  RepeatIcon,
} from '@/components/icons';
import {
  SettingsButton,
  SettingsMessage,
  SettingsToggle,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, FontFamilyBold, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dayLabel, formatTime, parseDay } from '@/utils/date';

export type { EditorResult } from '@/components/calendar/use-event-editor';

/**
 * The editor's three pieces. Shells lay them out — the header pinned at the
 * top, the fields scrolling, the actions pinned at the bottom (above the
 * keyboard in the sheet) — so Save is reachable from any field without
 * scrolling the form or dismissing the keyboard first.
 *
 * The fields scroll; the header and the actions stay put around them.
 */

/** The header's measurements — the month header's bar, scaled to a sheet. */
const Bar = {
  paddingHorizontal: Spacing.four - Spacing.one,
  paddingTop: Spacing.two,
  paddingBottom: Spacing.three - Spacing.one,
  // The settings screen's title size, so a sheet's day reads as a screen
  // title rather than a caption.
  titleSize: 28,
  titleLineRatio: 1.3,
  subtitleSize: 14,
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
    ? formatTime(editor.endTime)
    : `${dayLabel(editor.endDay)} ${formatTime(editor.endTime)}`;
  return `${mode} · ${formatTime(editor.startTime)} – ${end}`;
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

/**
 * Every field, in order — the scrolling part of the editor. Captions stacked
 * above the fields with their glyphs, as in settings and the connect screen,
 * but no cards: the groups (what, when, details) are told apart by spacing,
 * which keeps the form short enough to fill in without much scrolling.
 */
export function EventEditorFields({
  editor,
  TextInputComponent,
  titleRef,
  autoFocusTitle = false,
  onFocusTail,
}: FieldsProps) {
  const {
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
      <View style={styles.group}>
        <FieldStack label="Title" icon={PencilIcon}>
          <TextField
            ref={titleRef}
            TextInputComponent={TextInputComponent}
            style={styles.titleInput}
            value={summary}
            onChangeText={setSummary}
            placeholder="Add a title"
            autoFocus={autoFocusTitle}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            testID="editor-summary"
          />
          <FieldProblem text={editor.problemFor('title')} />
        </FieldStack>
        {calendars.length > 1 && calendarUrl && (
          <FieldStack label="Calendar" icon={CalendarIcon}>
            <CalendarField
              calendars={calendars}
              value={calendarUrl}
              onChange={setCalendarUrl}
              testID="editor-calendar"
            />
            {editor.event?.recurring &&
              editor.originalCalendarUrl !== undefined &&
              calendarUrl !== editor.originalCalendarUrl && (
                <SettingsMessage>
                  Moves every occurrence of this repeating event.
                </SettingsMessage>
              )}
          </FieldStack>
        )}
      </View>

      <View style={styles.group}>
        <FieldStack label="Starts" icon={ClockPlayIcon}>
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
        </FieldStack>
        <FieldStack label="Ends" icon={ClockStopIcon}>
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
          <FieldProblem text={editor.problemFor('times')} />
        </FieldStack>
        <SettingsToggle
          on={allDay}
          label="All-day"
          onPress={() => setAllDay(!allDay)}
          testID="editor-all-day"
        />
        <RecurrenceField
          value={editor.recurrence}
          onChange={editor.setRecurrence}
          startDay={headerDay}
          TextInputComponent={TextInputComponent}
          testID="editor-repeat"
        />
        <FieldProblem text={editor.problemFor('repeat')} />
        <AlarmField
          value={editor.alarm}
          onChange={editor.setAlarm}
          allDay={allDay}
          hint={editor.alarmHint}
          testID="editor-alert"
        />
      </View>

      <View style={styles.group}>
        <FieldStack label="Location" icon={MapPinIcon}>
          <LocationField
            value={editor.location}
            onChange={editor.setLocation}
            TextInputComponent={TextInputComponent}
            onFocus={onFocusTail}
            testID="editor-location"
          />
        </FieldStack>
        <FieldStack label="Notes" icon={NotesIcon}>
          <TextField
            TextInputComponent={TextInputComponent}
            style={styles.notes}
            value={editor.description}
            onChangeText={editor.setDescription}
            placeholder="Add notes"
            onFocus={onFocusTail}
            multiline
            testID="editor-notes"
          />
        </FieldStack>
      </View>
    </View>
  );
}

/** A validation problem, under the field it is about. */
function FieldProblem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <SettingsMessage tone="problem" testID="editor-field-problem">
      {text}
    </SettingsMessage>
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
 * right — settings' buttons, Save spinning while it writes. A failed write
 * shows here, above the buttons; a problem with one field shows under that
 * field instead (FieldProblem).
 */
export function EventEditorActions({
  editor,
  onClose,
  bottomInset = 0,
}: ActionsProps) {
  const theme = useTheme();
  const { event, busy, problem, save, remove, scopeAsk } = editor;
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
        <SettingsMessage tone="problem" testID="editor-problem">
          {problem}
        </SettingsMessage>
      )}
      {scopeAsk ? (
        <ScopeChoice
          ask={scopeAsk}
          onChoose={editor.chooseScope}
          onCancel={editor.cancelScope}
        />
      ) : (
        <View style={styles.actionRow}>
          {event && (
            <SettingsButton
              label="Delete"
              variant="danger"
              disabled={busy}
              onPress={remove}
              testID="editor-delete"
            />
          )}
          <View style={styles.actionsRight}>
            <SettingsButton
              label="Cancel"
              disabled={busy}
              onPress={onClose}
              testID="editor-cancel"
            />
            <SettingsButton
              label="Save"
              variant="filled"
              busy={busy}
              onPress={save}
              testID="editor-save"
            />
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * "Which occurrences?" for a repeating event's Save or Delete, in place of
 * the action row — the question and its answers where the button was just
 * pressed, rather than a dialog over the form.
 */
function ScopeChoice({
  ask,
  onChoose,
  onCancel,
}: {
  ask: NonNullable<EventEditorController['scopeAsk']>;
  onChoose: (scope: EditScope) => void;
  onCancel: () => void;
}) {
  const variant = ask.action === 'delete' ? 'danger' : 'text';
  return (
    <View style={styles.scope}>
      <SettingsMessage icon={RepeatIcon}>
        {ask.action === 'delete'
          ? 'This is a repeating event. Delete:'
          : 'This is a repeating event. Save the changes to:'}
      </SettingsMessage>
      <View style={styles.scopeOptions}>
        {ask.allowThis && (
          <SettingsButton
            label="This event"
            variant={variant}
            onPress={() => onChoose('this')}
            testID="editor-scope-this"
          />
        )}
        <SettingsButton
          label="This and following"
          variant={variant}
          onPress={() => onChoose('following')}
          testID="editor-scope-following"
        />
        <SettingsButton
          label="All events"
          variant={variant}
          onPress={() => onChoose('all')}
          testID="editor-scope-all"
        />
      </View>
      <View style={styles.actionsRight}>
        <SettingsButton
          label="Back"
          onPress={onCancel}
          testID="editor-scope-cancel"
        />
      </View>
    </View>
  );
}

/** The rule above the action bar — the grid's and the widget's divider grey,
 *  which reads on either scheme. */
const DIVIDER = '#60646C';

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
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    // Between groups: a clear step more than between the fields in one.
    gap: Spacing.four + Spacing.one,
  },
  group: {
    gap: Spacing.three,
  },
  titleInput: {
    fontSize: 17,
  },
  notes: {
    minHeight: 88,
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
  actions: {
    paddingHorizontal: Bar.paddingHorizontal,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scope: {
    gap: Spacing.two,
  },
  scopeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
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
});
